import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

import { PROFIL_GENERIQUE } from "./depots.mjs";
import { depotGit, juge, jugeDepuis } from "./essais-de-la-garde.mjs";

const PARTAGE = { ...PROFIL_GENERIQUE, arbrePartage: true };
const ILLISIBLE =
  "le dossier où ce git s'exécute ne se lit pas avant exécution (`cd` vers une cible absente, à variable, à option ou sans argument, `-C` à variable, `--git-dir`, `--work-tree`, `GIT_DIR`, `GIT_WORK_TREE`) : " +
  "la garde ne sait pas quel dépôt il touche. `cd <dossier existant> && git …` ou `git -C <dossier littéral> …`.";

test("LEC-4.7 · un segment git se juge dans le dépôt où il s'exécute, -C et cd de la chaîne compris", () => {
  const hors = mkdtempSync(join(tmpdir(), "garde-hors-"));
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = juge("git rm a.md", { profil: PARTAGE });
  assert.notEqual(refusDuPartage, null);

  for (const [cwd, commande] of [
    [hors, `git -C ${seul} rm a.md`],
    [hors, `ls; cd ${seul}; git commit -F m -- a.md`],
    [hors, "cd /nexiste/pas; git status"],
    [seul, `(cd ${partage} && ls) && git rm a.md`],
    [seul, `cd ${partage} | cat; git rm a.md`],
    [seul, `echo $(cd ${partage} && pwd); git rm a.md`],
  ])
    assert.equal(depuis(cwd, commande), null, `${commande} a ete refusee a tort`);

  for (const commande of [
    `git -C ${partage} rm a.md`,
    `git -C ${dirname(partage)} -C ${basename(partage)} rm a.md`,
    `true && cd ${partage} && git rm a.md`,
    `ls; cd ${partage}; git rm a.md`,
    `false || cd ${partage}\ngit rm a.md`,
    `cd /nexiste/pas; git -C ${partage} rm a.md`,
  ])
    assert.equal(depuis(hors, commande), refusDuPartage, `${commande} a franchi le garde`);

  for (const commande of [
    "cd /nexiste/pas; git rm a.md",
    `ls | cd ${partage}; git rm a.md`,
    `cd $D && git commit -F m -- a.md`,
    `cd -P ${seul} && git add a.md`,
    "git -C $D rm a.md",
    `git --git-dir=${seul}/.git --work-tree=${seul} rm a.md`,
    `git --git-dir ${seul}/.git restore --staged a.md`,
    `GIT_DIR=${seul}/.git git rm a.md`,
    `GIT_DIR=${seul}/.git git -C ${seul} mv a.md b.md`,
    `export GIT_WORK_TREE=${seul}; git commit -F m -- a.md`,
  ])
    assert.equal(depuis(hors, commande), ILLISIBLE, `${commande} a franchi le garde`);
});
