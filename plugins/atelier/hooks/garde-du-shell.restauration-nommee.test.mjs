import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, git, jugeDepuis } from "./essais-de-la-garde.mjs";

const FORME = "un fichier suivi absent de l'arbre se rend, fichier par fichier, par `git restore --source=HEAD --staged --worktree -- <f>`";

test("LEC-4.5 · le refus d'une restauration nomme la forme qui rend un fichier absent", () => {
  const seul = depotGit({ "a.md": "a\n", "specs/c.md": "c\n" });
  const partage = depotGit({ "a.md": "a\n" });
  git(seul, "rm", "-q", "-r", "--", "specs");
  rmSync(join(partage, "a.md"));
  const depuis = jugeDepuis(partage);

  for (const commande of ["git restore --source=HEAD --staged --worktree -- specs/", "git restore --source=HEAD --staged --worktree -- a.md", "git checkout -- a.md"])
    assert.ok((depuis(seul, commande) ?? "").includes(FORME), `le refus de ${commande} ne nomme pas la forme qui passe`);
  const refusDuPartage = depuis(partage, "git restore --source=HEAD --staged --worktree -- a.md") ?? "";
  assert.notEqual(refusDuPartage, "");
  assert.ok(!refusDuPartage.includes(FORME), "sur un arbre partagé, le refus nomme une restauration qu'il refuse");
});
