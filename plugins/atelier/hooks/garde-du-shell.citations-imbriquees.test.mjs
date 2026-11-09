import assert from "node:assert/strict";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";
import { dossierDeLaCommande, masquer, reecritureDuShell } from "./garde-du-shell.mjs";

const APOSTROPHE =
  "une apostrophe dans `\"${…}\"` se lit autrement sous bash, qui y protège `}` et `\"`, que sous zsh, qui la laisse littérale : la garde ne sait plus où ferme la valeur. Sors la valeur des guillemets (`${v:-'a}b'}`), ou échappe le caractère (`\"${v:-a\\}b}\"`).";
const GRAVE = "un accent grave échappé dans un accent grave ouvre une substitution imbriquée que la garde ne lit pas : écris `$( … )`.";

test("LEC-4.7 · les citations imbriquées se ferment comme sous bash et zsh, et chaque substitution se juge", () => {
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const [cwd, commande] of [
    [partage, `echo $'\\''; git rm a.md`],
    [partage, `{ cd ${seul}; echo $'\\''; } | cat; git rm a.md`],
    [partage, `{ cd ${seul}; echo "\${x:-" }; "}"; } | cat; git rm a.md`],
    [partage, `echo "$(git rm a.md)"`],
    [partage, 'echo "`git rm a.md`"'],
    [partage, "echo `git rm a.md`"],
    [partage, "x=`git rm a.md`"],
    [partage, `echo "$(echo ")"; git rm a.md)"`],
    [seul, `echo "$(cd ${partage} && git rm a.md)"`],
    [partage, "echo `echo '\\`'`; git rm a.md"],
    [partage, `{ cd ${seul}; echo \`{ :\`; } | cat; git rm a.md`],
    [partage, "echo `echo a # x`; git rm a.md"],
    [partage, `echo "$( (true); git rm a.md )"`],
    [partage, "echo `echo \"a`; git rm a.md"],
    [partage, "echo `echo $(true # )`; git rm a.md"],
    [partage, `echo 'a\\'; git rm a.md`],
  ])
    assert.equal(depuis(cwd, commande), refusDuPartage, `${commande} a franchi le garde`);
  for (const commande of [`x=; echo "\${x:-'}'}"; git rm a.md`, `echo "\${x:-'"'}"`])
    assert.equal(depuis(seul, commande), APOSTROPHE, `${commande} a franchi le garde`);
  assert.equal(depuis(seul, "echo `echo \\`git rm a.md\\``"), GRAVE);
  for (const [cwd, commande] of [
    [seul, `git commit -m "$(cat <<'EOF'\nfeat: x\nEOF\n)" -- a.md`],
    [seul, `x=; echo "\${x:-'a b'}"; git rm a.md`],
    [seul, `echo $'a\\tb' "\${x:-"}"}"; git rm a.md`],
    [partage, `echo "$(git status)" \`git log -1\``],
    [partage, `echo "$(cd ${seul}; echo "$(git rm a.md)")"`],
    [partage, `cd ${seul}; echo "$(git rm a.md)"`],
    [seul, `pnpm test > /dev/null 2>&1 && git commit -m "$(cat m)" -- a.md`],
  ])
    assert.equal(depuis(cwd, commande), null, `${commande} a ete refusee a tort`);
  for (const commande of ["echo `echo a > b.txt`", `echo "$(echo a > b.txt)"`])
    assert.match(depuis(seul, commande) ?? "", /^redirection vers `b\.txt`/, `${commande} a franchi le garde`);
  assert.equal(dossierDeLaCommande(`x=\`cd ${partage}\`; git status`, seul), seul);
  assert.equal(reecritureDuShell('echo "$(git grep -E "\\bx" -- a)"'), 'echo "$(git grep -P "\\bx" -- a)"');
  for (const commande of ["echo a\\", 'echo "$(a \\'])
    assert.equal(masquer(commande).length, commande.length, `${commande} se masque sur une autre longueur`);
});
