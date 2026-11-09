import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, git, jugeDepuis } from "./essais-de-la-garde.mjs";

const REFUS = /^`git restore` sous cette forme jette du travail non commité/;

test("LEC-4.5 · restaurer un fichier absent passe, écraser un fichier présent reste refusé", () => {
  const chemins = ["a.md", "present.md", "lien.md", "indexe.md", "retire.md", "absent/x.md", "specs/c.md", "fichier/x.md", "lienparent/x.md", "sous/y.md", "dossier.md", "x*.md", "vide/z.md"];
  const seul = depotGit(Object.fromEntries(chemins.map((chemin) => [chemin, `${chemin}\n`])));
  const partage = depotGit({ "a.md": "a\n" });
  const ici = (chemin) => join(seul, chemin);
  for (const chemin of ["a.md", "lien.md", "sous/y.md", "dossier.md", "x*.md"]) rmSync(ici(chemin));
  mkdirSync(ici("dossier.md"));
  for (const dossier of ["absent", "specs", "fichier", "lienparent"]) rmSync(ici(dossier), { recursive: true });
  symlinkSync("nulle-part", ici("lien.md"));
  writeFileSync(ici("fichier"), "x\n");
  mkdirSync(ici("ailleurs"));
  symlinkSync(ici("ailleurs"), ici("lienparent"));
  writeFileSync(ici("indexe.md"), "change\n");
  git(seul, "add", "--", "indexe.md");
  rmSync(ici("indexe.md"));
  git(seul, "rm", "-q", "--", "retire.md");
  git(seul, "rm", "-q", "-r", "--", "vide");
  rmSync(join(partage, "a.md"));
  const depuis = jugeDepuis(partage);

  for (const [cwd, commande] of [
    [seul, "git restore --source=HEAD --staged --worktree -- a.md"],
    [seul, "git restore -s HEAD -S -W -- a.md"],
    [seul, "git restore --staged --worktree a.md"],
    [seul, "git restore -W -S -- absent/x.md"],
    [seul, "git restore --staged --worktree -- retire.md"],
    [seul, "git restore --staged --worktree -- specs/c.md"],
    [seul, "git restore --staged --worktree -- ./sous/../a.md"],
    [ici("sous"), "git restore --staged --worktree -- y.md ../a.md"],
    [seul, "git restore --staged present.md"],
  ])
    assert.equal(depuis(cwd, commande), null, `${commande} a ete refusee a tort`);
  for (const [cwd, commande] of [
    [seul, "git restore --source=HEAD --staged --worktree -- present.md"],
    [seul, "git restore --staged --worktree -- a.md present.md"],
    [seul, "git restore --source=HEAD~1 --staged --worktree -- a.md"],
    [seul, "git restore -s HEAD~1 --staged --worktree -- a.md"],
    [seul, "git restore --staged --worktree --ours -- a.md"],
    [seul, "git restore --staged --worktree --pathspec-from-file=liste"],
    [seul, "git restore --staged --worktree --"],
    [seul, "git restore --source=HEAD --worktree -- a.md"],
    [seul, "git restore --staged --worktree -- '*.md'"],
    [seul, "git restore --staged --worktree -- :/a.md"],
    [seul, "git restore --staged --worktree -- specs/"],
    [seul, "git restore --staged --worktree -- specs/."],
    [seul, "git restore --staged --worktree -- lien.md"],
    [seul, "git restore --staged --worktree -- fichier/x.md"],
    [seul, "git restore --staged --worktree -- lienparent/x.md"],
    [seul, "git restore --staged --worktree -- indexe.md"],
    [seul, "git restore --staged --worktree -- jamais.md"],
    [seul, "git restore --staged --worktree -- dossier.md"],
    [seul, "git restore --staged --worktree -- 'x*.md'"],
    [seul, "git restore --staged --worktree -- vide/"],
    [partage, "git restore --source=HEAD --staged --worktree -- a.md"],
  ])
    assert.match(depuis(cwd, commande) ?? "", REFUS, `${commande} a franchi le garde`);
});
