import assert from "node:assert/strict";
import { test } from "node:test";

import { PROFIL_GENERIQUE } from "./depots.mjs";
import { depotGit, juge } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · un # dans une substitution `…` ou ${…} n'ouvre pas de commentaire", () => {
  const partage = depotGit({ "a.md": "a\n" });
  const depuis = (commande) => juge(commande, { cwd: partage, racine: partage, profil: { ...PROFIL_GENERIQUE, arbrePartage: true } });

  for (const [avec, sans] of [
    ["echo `echo #` ; git rm a.md", "echo `echo x` ; git rm a.md"],
    ["echo ${x:- #} ; git rm a.md", "echo ${x:- y} ; git rm a.md"],
    ["echo `true #` ; git commit -m x --no-verify", "echo `true x` ; git commit -m x --no-verify"],
    ["echo ${x:- #} > /etc/x", "echo ${x:- y} > /etc/x"],
  ]) {
    assert.notEqual(depuis(sans), null, `${sans} devrait etre refusee`);
    assert.equal(depuis(avec), depuis(sans), `${avec} a franchi le garde`);
  }
  for (const commande of ["echo ${x} # ; git rm a.md", "ls # l'accent ` reste au commentaire ; git rm a.md\nls"])
    assert.equal(depuis(commande), null, `${commande} a ete refusee a tort`);
});
