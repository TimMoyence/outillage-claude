import assert from "node:assert/strict";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

const AMBIGUE =
  "une accolade `{` dans `${…}` se lit autrement sous bash, qui ferme au premier `}`, que sous zsh, qui l'imbrique : la garde ne sait plus où ferment les groupes. Cite la valeur (`\"${v:-{}\"`).";

test("LEC-4.7 · un { nu dans ${…} se refuse, et $${ n'ouvre pas de ${", () => {
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const commande of [
    `{ cd ${seul}; echo \${v:-{}; } | cat; git rm a.md`,
    `echo \${v:-{}; { cd ${seul}; } | cat; git rm a.md`,
    `{ cd ${seul}; echo \${v:-{a} }; } | cat; git rm a.md`,
  ])
    assert.equal(depuis(partage, commande), AMBIGUE, `${commande} a franchi le garde`);
  for (const commande of [`{ cd ${seul}; echo $\${; } | cat; git rm a.md`, `echo $\${x}; git rm a.md`])
    assert.equal(depuis(partage, commande), refusDuPartage, `${commande} a franchi le garde`);
  for (const commande of [`{ cd ${seul}; echo "\${v:-{}"; }; git rm a.md`, `echo \${a:-\${b}}; git rm a.md`])
    assert.equal(depuis(seul, commande), null, `${commande} a ete refusee a tort`);
});
