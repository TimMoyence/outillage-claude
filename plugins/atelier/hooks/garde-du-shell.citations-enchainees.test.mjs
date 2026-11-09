import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, juge } from "./essais-de-la-garde.mjs";

const CITE =
  "ce commit retire des chemins que des fichiers suivis citent encore (1 citation) :\nindex.md:1 → docs/a.md\n" +
  "réécris ou retire ces citations, ou relance avec `CITANTS_LUS=1` en préfixe du commit ; ou rends le fichier par `git restore --source=HEAD --staged --worktree -- <f>`.";
const illisible = (geste) =>
  `ce commit suit un geste qui retire ou déplace des chemins que la garde ne lit pas avant exécution (\`${geste}\`) : lance ce geste seul, puis le commit.`;

test("LEC-4.4 · un rm enchaîné avant le commit dans la même commande compte comme retiré", () => {
  const depot = depotGit({ "docs/a.md": "a\n", "docs/z.md": "z\n", "index.md": "Voir docs/a.md\n" });
  const dans = (commande) => juge(commande, { cwd: depot, racine: depot });

  for (const commande of [
    "rm docs/a.md && git commit -F m -- docs/a.md",
    "rm -f docs/a.md; git commit -F m -- docs",
    "rm docs/a.md || git commit -F m -- docs/a.md",
    "rm docs/a.md | git commit -F m -- docs/a.md",
    "rm docs/a.md & git commit -F m -- docs/a.md",
    "rm docs/a.md\ngit commit -F m -- docs/a.md",
    "/bin/rm -- docs/a.md && git commit -F m -- docs/a.md",
    "rm /tmp/journal-absent docs/a.md && git commit -F m -- docs/a.md",
    "cd docs && rm a.md && cd .. && git commit -F m -- docs/a.md",
    "git rm -q docs/a.md && git commit -F m -- docs/a.md",
    "git rm -q docs/a.md && git commit -i -F m -- docs/z.md",
    "rm docs/a.md; git add docs/a.md; git commit -i -F m -- docs/z.md",
  ])
    assert.equal(dans(commande), CITE, `${commande} a franchi le garde`);

  for (const commande of [
    "rm docs/a.md && git commit -F m -- docs/z.md",
    "git commit -F m -- docs/a.md && rm docs/a.md",
    "pnpm clean && git commit -F m -- docs/a.md",
    "rm docs/a.md; git commit -i -F m -- docs/z.md",
    "rm docs/z.md && git commit -F m -- docs/z.md",
    "find docs -name a.md && git commit -F m -- docs/a.md",
  ])
    assert.equal(dans(commande), null, `${commande} a ete refusee a tort`);

  for (const [commande, geste] of [
    ["rm $F && git commit -F m -- docs/a.md", "rm $F"],
    ["rm docs/*.md && git commit -F m -- docs/a.md", "rm docs/*.md"],
    ["rm `cat liste` && git commit -F m -- docs/a.md", "rm `cat liste`"],
    ["mv docs/a.md docs/c.md && git commit -F m -- docs", "mv docs/a.md docs/c.md"],
    ["/bin/mv docs/a.md docs/c.md && git commit -F m -- docs", "/bin/mv docs/a.md docs/c.md"],
    ["git mv docs/a.md docs/c.md; git commit -F m -- docs", "git mv docs/a.md docs/c.md"],
    ["unlink docs/a.md && git commit -F m -- docs/a.md", "unlink docs/a.md"],
    ["rmdir docs/vide && git commit -F m -- docs/a.md", "rmdir docs/vide"],
    ["trash docs/a.md && git commit -F m -- docs/a.md", "trash docs/a.md"],
    ["find docs -name a.md -delete && git commit -F m -- docs/a.md", "find docs -name a.md -delete"],
    ["find docs -exec rm {} + ; git commit -F m -- docs/a.md", "find docs -exec rm {} +"],
    ["ls docs | xargs rm; git commit -F m -- docs/a.md", "xargs rm"],
    ["mv docs/a.md docs/c.md && CITANTS_LUS=1 git commit -F m -- docs", "mv docs/a.md docs/c.md"],
  ])
    assert.equal(dans(commande), illisible(geste), `${commande} a franchi le garde`);

  const hors = mkdtempSync(join(tmpdir(), "garde-hors-"));
  assert.equal(juge("mv a b && git commit -F m -- a", { cwd: hors, racine: hors }), null);
});
