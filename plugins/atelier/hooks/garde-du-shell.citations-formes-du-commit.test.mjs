import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, git, juge } from "./essais-de-la-garde.mjs";

const CITE =
  "ce commit retire des chemins que des fichiers suivis citent encore (1 citation) :\nindex.md:1 → docs/a.md\n" +
  "réécris ou retire ces citations, ou relance avec `CITANTS_LUS=1` en préfixe du commit ; ou rends le fichier par `git restore --source=HEAD --staged --worktree -- <f>`.";
const ECRITE = (fichier) =>
  `ce commit lit ses chemins dans \`${fichier}\`, qu'un geste de la même commande écrit ou dont le nom ne se lit pas avant exécution : écris la liste seule, puis le commit.`;
const ILLISIBLES = (chemin) =>
  `un chemin de ce commit ne se lit pas avant exécution (\`${chemin}\`) et l'arbre porte une suppression face à HEAD : nomme les chemins en littéral, ou passe-les par \`--pathspec-from-file=<fichier>\`.`;

test("LEC-4.6 · une fusion se lit dans l'index, des chemins illisibles se nomment quand l'arbre porte une suppression", () => {
  const depot = depotGit({ "docs/a.md": "a\n", "docs/z.md": "z\n", "index.md": "Voir docs/a.md\n" });
  const dans = (commande, ici = depot) => juge(commande, { cwd: ici, racine: depot });
  const sansChemin = dans("git commit -F m");
  assert.notEqual(sansChemin, null);
  rmSync(join(depot, "docs/a.md"));
  writeFileSync(join(depot, "vide.txt"), "\n\n");
  writeFileSync(join(depot, "liste.txt"), "docs/a.md\n");
  writeFileSync(join(depot, "liste0.txt"), "docs/a.md\0");
  writeFileSync(join(depot, "docs/liste.txt"), "a.md\n");

  for (const commande of ["git commit -F m --", "git commit -F m --pathspec-from-file=-", "git commit -F m --pathspec-from-file=vide.txt"])
    assert.equal(dans(commande), sansChemin, `${commande} a franchi le garde`);
  assert.equal(dans("git commit -F m --pathspec-from-file=absente.txt"), null);
  for (const commande of [
    "git commit -F m --pathspec-from-file=liste.txt",
    "git commit -F m --pathspec-from-file liste.txt",
    "git commit -F m --pathspec-from-file=liste0.txt --pathspec-file-nul",
    "cd docs && git commit -F m --pathspec-from-file=liste.txt",
  ])
    assert.equal(dans(commande), CITE, `${commande} a franchi le garde`);
  const temporaire = join(mkdtempSync(join(tmpdir(), "garde-liste-")), "liste.txt");
  for (const [commande, fichier] of [
    [`printf 'docs/a.md\\n' > ${temporaire} && git commit -F m --pathspec-from-file=${temporaire}`, temporaire],
    ["echo docs/a.md | tee neuve.txt; git commit -F m --pathspec-from-file=neuve.txt", "neuve.txt"],
    ["echo docs/z.md | tee liste.txt && git commit -F m --pathspec-from-file=liste.txt", "liste.txt"],
    ["cd docs && echo a.md | tee ../liste.txt; cd .. && git commit -F m --pathspec-from-file=liste.txt", "liste.txt"],
    ["git commit -F m --pathspec-from-file=$L", "$L"],
  ])
    assert.equal(dans(commande), ECRITE(fichier), `${commande} a franchi le garde`);
  for (const [commande, chemin] of [
    ["git commit -F m -- $CHEMINS", "$CHEMINS"],
    ["git commit -F m -- docs/z.md docs/`ls`", "docs/`ls`"],
  ])
    assert.equal(dans(commande), ILLISIBLES(chemin), `${commande} a franchi le garde`);
  const propre = depotGit({ "docs/a.md": "a\n", "index.md": "Voir docs/a.md\n" });
  assert.equal(dans("git commit -F m -- $CHEMINS", propre), null);

  const fusion = depotGit({ "docs/a.md": "a\n", "index.md": "Voir docs/a.md\n" });
  git(fusion, "rm", "-q", "docs/a.md");
  writeFileSync(join(fusion, "index.md"), "plus rien\n");
  writeFileSync(join(fusion, ".git/MERGE_HEAD"), `${git(fusion, "rev-parse", "HEAD").stdout.trim()}\n`);
  for (const commande of ["git commit -F m", "git commit -F m --"])
    assert.equal(juge(commande, { cwd: fusion, racine: fusion }), CITE, `${commande} a franchi le garde`);
  git(fusion, "add", "index.md");
  assert.equal(juge("git commit -F m", { cwd: fusion, racine: fusion }), null);
});
