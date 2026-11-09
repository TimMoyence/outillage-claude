import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · if, for, while et until se jugent comme un groupe { }, et le } de zsh sans ; ferme le groupe", () => {
  const hors = mkdtempSync(join(tmpdir(), "garde-hors-"));
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const [cwd, commande] of [
    [partage, `if true; then cd ${seul}; fi | cat; git rm a.md`],
    [partage, `for i in 1; do cd ${seul}; done | cat; git rm a.md`],
    [partage, `while false; do cd ${seul}; done & git rm a.md`],
    [partage, `until true; do cd ${seul}; done | cat; git rm a.md`],
    [partage, `{ cd ${seul}; pwd } | cat; git rm a.md`],
    [hors, `if true; then cd ${partage}; fi && git rm a.md`],
    [hors, `for i in 1; do cd ${partage} && git rm a.md; done | cat`],
  ])
    assert.equal(depuis(cwd, commande), refusDuPartage, `${commande} a franchi le garde`);
  assert.equal(depuis(partage, `if true; then cd ${seul}; fi; git rm a.md`), null);
  assert.match(depuis(partage, `echo x | while read l; do cd ${seul}; done; git rm a.md`) ?? "", /^le dossier où ce git s'exécute ne se lit pas/);
});
