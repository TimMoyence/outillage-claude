import { spawnSync } from "node:child_process";
import { basename, dirname } from "node:path";

import { reglagesDe } from "./reglages.mjs";

export const PROFIL_GENERIQUE = {
  cible: "`pnpm exec vitest run <fichiers>` ou `pnpm exec jest <fichiers>`, `pnpm exec eslint <fichiers>`, le typecheck du seul paquet touché",
  typecheck: "le script `typecheck` du paquet, ou `pnpm exec tsc -p <tsconfig>`",
  scriptsCibles: [],
};

export const profilDe = (nom, profils = reglagesDe().profils) => ({ ...PROFIL_GENERIQUE, ...profils[nom] });

export const depotDe = (cwd, profils = reglagesDe().profils) => {
  const sortie = spawnSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], { encoding: "utf8" });
  const [racine, commun] = sortie.status === 0 ? sortie.stdout.trim().split("\n") : [];
  if (!racine || !commun) return { racine: cwd, nom: null, profil: PROFIL_GENERIQUE };
  const nom = basename(basename(commun) === ".git" ? dirname(commun) : commun.replace(/\.git$/, ""));
  return { racine, nom, profil: profilDe(nom, profils) };
};
