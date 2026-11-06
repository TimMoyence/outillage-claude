import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { PROFIL_GENERIQUE, depotDe, profilDe } from "./depots.mjs";

const PROFILS = {
  "compta-partage": { arbrePartage: true, scriptsCibles: ["test:outillage", "e2e"] },
  boutique: { strykerEnPause: true, typecheck: "`pnpm --filter @boutique/api typecheck`" },
};

const depotVide = (chemin) => {
  spawnSync("git", ["init", "-q", chemin]);
  spawnSync("git", ["-C", chemin, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "base"]);
  return chemin;
};

test("un depot connu des reglages prend son profil par-dessus le profil generique", () => {
  const partage = profilDe("compta-partage", PROFILS);
  assert.equal(partage.arbrePartage, true);
  assert.deepEqual(partage.scriptsCibles, ["test:outillage", "e2e"]);
  assert.equal(partage.cible, PROFIL_GENERIQUE.cible);
  assert.equal(profilDe("boutique", PROFILS).strykerEnPause, true);
  assert.deepEqual(profilDe("inconnu", PROFILS), PROFIL_GENERIQUE);
});

test("le depot se lit depuis le dossier de travail, un worktree prenant le nom de son depot principal", () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "depots-worktree-")));
  const partage = depotVide(join(parent, "compta-partage"));
  mkdirSync(join(partage, "apps"));
  assert.equal(depotDe(join(partage, "apps"), PROFILS).racine, partage);
  assert.equal(depotDe(partage, PROFILS).profil.arbrePartage, true);
  const principal = depotVide(join(parent, "boutique"));
  spawnSync("git", ["-C", principal, "worktree", "add", "-q", join(parent, "boutique-stryker")]);
  const stryker = depotDe(join(parent, "boutique-stryker"), PROFILS);
  assert.equal(stryker.nom, "boutique");
  assert.equal(stryker.racine, join(parent, "boutique-stryker"));
  assert.equal(stryker.profil.strykerEnPause, true);
  assert.equal(depotDe(depotVide(join(parent, "portfolio", "portfolio-back")), PROFILS).nom, "portfolio-back");
});

test("hors de tout depot, le profil generique s'applique a la racine du dossier", () => {
  const ailleurs = mkdtempSync(join(tmpdir(), "depots-"));
  assert.deepEqual(depotDe(ailleurs, PROFILS), { racine: ailleurs, nom: null, profil: PROFIL_GENERIQUE });
});
