import assert from "node:assert/strict";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · le corps d'une fonction se juge aussi dans les dossiers où elle est appelée", () => {
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const commande of [
    `function f { git rm a.md; }; cd ${partage}; f`,
    `f() { git rm a.md; }; cd ${partage} && f`,
    `function f\n{\ngit rm a.md\n}\ncd ${partage}\nf`,
    `f() ( git rm a.md ); cd ${partage}; f`,
    `f() if true; then git rm a.md; fi; cd ${partage}; f`,
    `function f { echo "$(git rm a.md)"; }; cd ${partage}; f`,
    `function g { git rm a.md; }; function f { g; }; cd ${partage}; f`,
    `function f { g; }; function g { git rm a.md; }; cd ${partage}; f`,
    `function f { cd ${partage}; }; cd ${seul}; f; git rm a.md`,
    `function f { git rm a.md; }; (cd ${partage}; f)`,
    `function f { git rm a.md; }; cd ${partage}; echo "$(f)"`,
    `f() ( true; git rm a.md ); cd ${partage}; f`,
    `function f { git rm a.md; }; if false; then function f { :; }; fi; cd ${partage}; f`,
  ])
    assert.equal(depuis(seul, commande), refusDuPartage, `${commande} a franchi le garde`);
  for (const [cwd, commande] of [
    [partage, `cd ${seul}; function f { git rm a.md; }; f`],
    [seul, `function f { git rm a.md; }; cd ${partage}; echo f`],
    [seul, `function f { f; }; cd ${partage}; f`],
    [seul, `function f { git rm a.md; }; cd ${partage}; f() { :; }`],
    [seul, `function f { :; }; echo "$(git rm a.md)"; cd ${partage}; f`],
    [seul, `echo $(git rm a.md); cd ${partage}; echo`],
    [seul, "f() { :; }; pnpm test > /dev/null 2>&1 && f && git commit -m x -- a.md"],
  ])
    assert.equal(depuis(cwd, commande), null, `${commande} a ete refusee a tort`);
});
