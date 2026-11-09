import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · après une branche alternative, un git se juge dans chaque dossier possible", () => {
  const hors = mkdtempSync(join(tmpdir(), "garde-hors-"));
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const [cwd, commande] of [
    [hors, `if true; then cd ${partage}; else cd ${seul}; fi; git rm a.md`],
    [hors, `if true; then cd ${partage}; elif true; then cd ${seul}; fi && git rm a.md`],
    [hors, `cd ${partage} || cd ${seul}; git rm a.md`],
    [partage, `git status || cd ${seul}; git rm a.md`],
    [partage, `true || { :; cd ${seul}; }; git rm a.md`],
    [partage, `f() { cd ${seul}; }; git rm a.md`],
    [partage, `f () { cd ${seul}; }; f; git rm a.md`],
    [hors, `if false; then :; elif cd ${partage}; then git rm a.md; fi`],
    [partage, `if true; then cd ${seul}; else git rm a.md; fi`],
  ])
    assert.equal(depuis(cwd, commande), refusDuPartage, `${commande} a franchi le garde`);
  for (const commande of [
    `if true; then cd ${seul}; else cd ${seul}; fi; git rm a.md`,
    `if true; then cd ${seul}; fi; git rm a.md`,
    `cd ${seul} || exit 1; git rm a.md`,
    `if git status; then cd ${seul} && git rm a.md; else echo non; fi`,
  ])
    assert.equal(depuis(partage, commande), null, `${commande} a ete refusee a tort`);
});
