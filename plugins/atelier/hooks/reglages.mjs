import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const HUMAIN_PAR_DEFAUT = "l'humain";

const FICHIER = "atelier.json";

const nomGitDuPoste = () => spawnSync("git", ["config", "user.name"], { encoding: "utf8" }).stdout?.trim() ?? "";

export const nomDepuisGit = (nomGit) => {
  const mot = /\p{L}+/u.exec(nomGit ?? "")?.[0];
  return mot ? mot[0].toLocaleUpperCase("fr") + mot.slice(1) : HUMAIN_PAR_DEFAUT;
};

const lus = (dossier) => {
  try {
    return JSON.parse(readFileSync(join(dossier, FICHIER), "utf8"));
  } catch {
    return {};
  }
};

export const reglagesDe = (dossier = process.env.CLAUDE_PLUGIN_DATA, nomGit = nomGitDuPoste()) => {
  const fichier = dossier ? lus(dossier) : {};
  return {
    humain: typeof fichier.humain === "string" && fichier.humain.trim() ? fichier.humain : nomDepuisGit(nomGit),
    profils: fichier.profils && typeof fichier.profils === "object" ? fichier.profils : {},
  };
};

export const initialiserLesReglages = (dossier = process.env.CLAUDE_PLUGIN_DATA, nomGit = nomGitDuPoste()) => {
  if (!dossier || existsSync(join(dossier, FICHIER))) return false;
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, FICHIER), `${JSON.stringify({ humain: nomDepuisGit(nomGit), profils: {} }, null, 2)}\n`);
  return true;
};
