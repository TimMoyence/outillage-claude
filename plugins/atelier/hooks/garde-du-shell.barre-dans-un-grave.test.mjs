import assert from "node:assert/strict";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

const BARRE =
  "une barre oblique inverse devant `\\` ou `$` dans un accent grave s'y retire avant que le corps se lise, ce que la garde ne suit pas : écris `$( … )`.";

test("LEC-4.7 · une barre devant \\ ou $ dans un accent grave se refuse", () => {
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);

  for (const [cwd, commande] of [
    [partage, "echo `echo \\\\'; git rm a.md`"],
    [partage, 'echo `echo "\\$(git rm a.md)"`'],
    [partage, 'echo `echo "\\\\"; git rm a.md"`'],
    [partage, "echo `echo $'\\\\'; git rm a.md'`"],
    [seul, "echo `echo \\\\'; echo a > b.txt`"],
  ])
    assert.equal(depuis(cwd, commande), BARRE, `${commande} a franchi le garde`);
  for (const commande of ["echo `echo '\\\\' '\\$x'`", "echo $(echo \\\\) \\\\ \\$x"])
    assert.equal(depuis(partage, commande), null, `${commande} a ete refusee a tort`);
});
