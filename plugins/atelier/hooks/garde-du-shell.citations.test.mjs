import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { PROFIL_GENERIQUE } from "./depots.mjs";
import { depotGit, git, juge } from "./essais-de-la-garde.mjs";

const dans = (depot, commande, options = {}) => juge(commande, { cwd: depot, racine: depot, ...options });
const SORTIES = (n) => `réécris ou retire ces citations, ou relance avec \`CITANTS_LUS=${n}\` en préfixe du commit`;

test("LEC-4.1 · un commit qui retire un fichier encore cité est refusé et nomme le citant", () => {
  const depot = depotGit({
    "docs/a.md": "a\n",
    "docs/b.md": "Voir docs/a.md\n",
    "docs/z.md": "z\n",
    ".dockerignore": "docs/a.md\n",
    "index.md": [
      "Voir docs/a.md.",
      "[plan](/docs/a.md)",
      "docs/a.md:12 et docs/a.md#plan",
      "./docs/a.md",
      "apps/docs/a.md docs/a.md.bak user@docs/a.md ../docs/a.md docs/a.mdx",
      "git log -- docs/a.md",
      "",
    ].join("\n"),
    "CLAUDE.md": "@AGENTS.md\n",
    "AGENTS.md": "agents\n",
  });
  rmSync(join(depot, "docs/a.md"));
  assert.equal(
    dans(depot, "git commit -F m -- docs/a.md"),
    "ce commit retire des chemins que des fichiers suivis citent encore (5 citations) :\n" +
      "docs/b.md:1 → docs/a.md\nindex.md:1 → docs/a.md\nindex.md:2 → docs/a.md\nindex.md:3 → docs/a.md\nindex.md:4 → docs/a.md\n" +
      `${SORTIES(5)} ; ou rends le fichier par \`git restore --source=HEAD --staged --worktree -- <f>\`.`,
  );
  assert.equal(
    dans(depot, "git commit -F m -- docs/a.md", { profil: { ...PROFIL_GENERIQUE, arbrePartage: true } }).split("\n").at(-1),
    `${SORTIES(5)}.`,
  );
  assert.equal(dans(join(depot, "docs"), "git commit -F m -- 'a.*'", { racine: depot }).split("\n")[0], "ce commit retire des chemins que des fichiers suivis citent encore (5 citations) :");

  rmSync(join(depot, "docs/b.md"));
  assert.match(dans(depot, "git commit -F m -- docs/a.md docs/b.md") ?? "", /\(4 citations\)[^]*index\.md:4 → docs\/a\.md\n(?!docs\/b)/);
  assert.equal(dans(depot, "git commit -F m -- docs/z.md docs/b.md"), null);
  rmSync(join(depot, "docs/z.md"));
  assert.equal(dans(depot, "git commit -F m -- docs/z.md"), null);
  rmSync(join(depot, "AGENTS.md"));
  assert.match(dans(depot, "git commit -F m -- AGENTS.md") ?? "", /\(1 citation\) :\nCLAUDE\.md:1 → AGENTS\.md\n/);

  const reecrit = depotGit({ "docs/a.md": "a\n", "index.md": "Voir docs/a.md\n" });
  rmSync(join(reecrit, "docs/a.md"));
  writeFileSync(join(reecrit, "index.md"), "plus rien\n");
  assert.equal(dans(reecrit, "git commit -F m -- docs/a.md index.md"), null);
  assert.match(dans(reecrit, "git commit -F m -- docs/a.md") ?? "", /\nindex\.md:1 → docs\/a\.md\n/);

  const indexe = depotGit({ "docs/a.md": "a\n", "docs/z.md": "z\n", "index.md": "Voir docs/a.md\n" });
  git(indexe, "rm", "-q", "docs/a.md");
  writeFileSync(join(indexe, "docs/z.md"), "z2\n");
  assert.equal(dans(indexe, "git commit -F m -- docs/z.md"), null);
  assert.match(dans(indexe, "git commit -i -F m -- docs/z.md") ?? "", /\nindex\.md:1 → docs\/a\.md\n/);

  const renomme = depotGit({ "docs/a.md": "a\n", "index.md": "Voir docs/a.md\n" });
  git(renomme, "mv", "docs/a.md", "docs/c.md");
  assert.match(dans(renomme, "git commit -F m -- docs/a.md docs/c.md") ?? "", /\nindex\.md:1 → docs\/a\.md\n/);

  const nombreux = depotGit({ "docs/a.md": "a\n", "index.md": "docs/a.md\n".repeat(25) });
  rmSync(join(nombreux, "docs/a.md"));
  const refus = dans(nombreux, "git commit -F m -- docs/a.md") ?? "";
  assert.equal(refus.split("\n").filter((ligne) => ligne.includes(" → ")).length, 20);
  assert.match(refus, /^ce commit retire des chemins que des fichiers suivis citent encore \(25 citations\) :\n[^]*\nindex\.md:20 → docs\/a\.md\n… et 5 autres\nréécris ou retire ces citations, ou relance avec `CITANTS_LUS=25`/);
});
