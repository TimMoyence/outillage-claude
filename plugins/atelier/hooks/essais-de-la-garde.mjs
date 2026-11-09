import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { PROFIL_GENERIQUE } from "./depots.mjs";
import { dossierDeLaCommande, refusDuShell } from "./garde-du-shell.mjs";

export const RACINE = "/depot";
export const IMAGE_DE_LA_CI = "mcr.microsoft.com/playwright:v1.61.1-noble";

export const juge = (commande, options = {}) =>
  refusDuShell(commande, {
    racine: RACINE,
    cwd: RACINE,
    profil: PROFIL_GENERIQUE,
    humain: "Tim",
    processus: () => [],
    nonSuivies: () => [],
    imagesDeLaCi: () => [IMAGE_DE_LA_CI],
    ...options,
  });
export const jugeDepuis = (partage) => {
  const depots = (dossier) => ({ racine: dossier, profil: dossier === partage ? { ...PROFIL_GENERIQUE, arbrePartage: true } : PROFIL_GENERIQUE });
  return (cwd, commande) => juge(commande, { cwd, ...depots(dossierDeLaCommande(commande, cwd)), depotDe: depots });
};
export const passe = (commandes, options) => {
  for (const commande of commandes) assert.equal(juge(commande, options), null, `${commande} a ete refusee a tort`);
};
export const refuse = (commandes, motif, options) => {
  for (const commande of commandes) assert.match(juge(commande, options) ?? "", motif, `${commande} a franchi le garde`);
};

export const git = (depot, ...args) => spawnSync("git", ["-C", depot, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });

export const depotGit = (fichiers = {}) => {
  const depot = mkdtempSync(join(tmpdir(), "garde-du-shell-"));
  spawnSync("git", ["init", "-q", depot]);
  writeFileSync(join(depot, ".gitignore"), "node_modules/\n");
  const chemins = Object.keys(fichiers);
  for (const chemin of chemins) {
    mkdirSync(dirname(join(depot, chemin)), { recursive: true });
    writeFileSync(join(depot, chemin), fichiers[chemin]);
  }
  if (chemins.length > 0) {
    git(depot, "add", "--", ...chemins);
    git(depot, "commit", "-q", "-m", "init", "--", ...chemins);
  }
  return depot;
};
