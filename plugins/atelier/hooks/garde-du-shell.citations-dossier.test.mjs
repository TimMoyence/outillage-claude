import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, juge } from "./essais-de-la-garde.mjs";

const dans = (depot, commande) => juge(commande, { cwd: depot, racine: depot });
const SORTIES = (n) =>
  `réécris ou retire ces citations, ou relance avec \`CITANTS_LUS=${n}\` en préfixe du commit ; ou rends le fichier par \`git restore --source=HEAD --staged --worktree -- <f>\`.`;

test("LEC-4.2 · un dossier que le commit vide et que le README cite refuse le commit", () => {
  const depot = depotGit({
    ".gitignore": "node_modules/\n*.log\n",
    ".prettierignore": "docs/superpowers/specs/\n",
    "docs/guide.md": "guide\n",
    "docs/superpowers/specs/a.md": "a\n",
    "docs/superpowers/specs/b.md": "b\n",
    "README.md": [
      "Voir docs/superpowers/specs/",
      "Plan : docs/superpowers/specs",
      "Tout docs/ reste",
      "specs et superpowers",
      "docs/superpowers/specs/b.md et docs/superpowers/specs/",
      "",
    ].join("\n"),
  });
  writeFileSync(join(depot, "docs/superpowers/specs/notes.log"), "ignoré\n");
  rmSync(join(depot, "docs/superpowers/specs/a.md"));
  assert.equal(dans(depot, "git commit -F m -- docs/superpowers/specs/a.md"), null);
  rmSync(join(depot, "docs/superpowers/specs/b.md"));
  assert.equal(
    dans(depot, "git commit -F m -- docs/superpowers/specs"),
    "ce commit retire des chemins que des fichiers suivis citent encore (3 citations) :\n" +
      "README.md:1 → docs/superpowers/specs/\nREADME.md:2 → docs/superpowers/specs/\nREADME.md:5 → docs/superpowers/specs/b.md\n" +
      SORTIES(3),
  );

  const racine = depotGit({ "docs/a.md": "a\n", "README.md": "Voir docs/ et docs\ndocuments/ apps/docs/ docs\n" });
  rmSync(join(racine, "docs/a.md"));
  assert.equal(
    dans(racine, "git commit -F m -- docs/a.md"),
    `ce commit retire des chemins que des fichiers suivis citent encore (1 citation) :\nREADME.md:1 → docs/\n${SORTIES(1)}`,
  );
});
