#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { lotsDe } from "../skills/livrer/scripts/etat-du-lot.mjs";
import { depotDe } from "./depots.mjs";
import { initialiserLesReglages, reglagesDe } from "./reglages.mjs";

const phaseDu = (lot) => {
  if (lot.mode === "feature" && !(lot.contrat?.valide && lot.contrat?.critique?.status === "CLEAR")) return "cadrage : contrat à valider puis à critiquer";
  const prochaine = (lot.steps ?? []).find((step) => step.etat !== "vert");
  if (prochaine) return `boucle · prochaine step ${prochaine.id} ${prochaine.etat ?? "sans état"} : ${prochaine.must ?? ""}`.trim();
  return "passe finale : audit, breaker, puis le rapport";
};

const lotsDu = (chemin) => {
  try {
    return lotsDe(chemin);
  } catch {
    return [];
  }
};

const lister = (dossier) => {
  try {
    return readdirSync(dossier).filter((fichier) => fichier.endsWith(".tasklist.json"));
  } catch {
    return [];
  }
};

const dossiersDeLivrer = (racine) => {
  try {
    return readFileSync(join(racine, ".claude", "livrer.md"), "utf8")
      .split("\n")
      .filter((ligne) => /task ?list/i.test(ligne))
      .flatMap((ligne) => [...ligne.matchAll(/`([^`\s]+\/)`/g)].map(([, dossier]) => resolve(racine, dossier)));
  } catch {
    return [];
  }
};

const depotsVoisinsPlusLongs = (parent, nom) => {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entree) => entree.isDirectory() && entree.name.startsWith(`${nom}-`))
      .map((entree) => entree.name);
  } catch {
    return [];
  }
};

const tasklistsOuvertes = (racine, nom) => {
  if (!nom) return [];
  const parent = dirname(racine);
  const voisins = depotsVoisinsPlusLongs(parent, nom);
  const duDepot = (fichier) => (lot) => (lot.depot ? lot.depot === nom : !voisins.some((voisin) => fichier.startsWith(`${voisin}-`)));
  const candidats = [
    ...lister(parent)
      .filter((fichier) => fichier.startsWith(`${nom}-`))
      .map((fichier) => ({ chemin: join(parent, fichier), garde: duDepot(fichier) })),
    ...dossiersDeLivrer(racine).flatMap((dossier) => lister(dossier).map((fichier) => ({ chemin: join(dossier, fichier), garde: () => true }))),
  ];
  return candidats
    .sort((a, b) => a.chemin.localeCompare(b.chemin))
    .flatMap(({ chemin, garde }) => lotsDu(chemin).filter(garde).map((lot) => `- ${chemin} · lot ${lot.lot} (${lot.mode}) · ${phaseDu(lot)}`));
};

export const contexteDeReprise = (racine, nom, humain) => {
  const qui = `${humain} est l'humain qui décide du produit et valide push, PR et merge.`;
  const lignes = tasklistsOuvertes(racine, nom);
  return lignes.length === 0
    ? qui
    : `${qui}\nTask lists livrer ouvertes pour le dépôt ${nom}. Une task list livrée est supprimée par la garde de fin de tour ; celles-ci ne le sont pas encore :\n${lignes.join("\n")}`;
};

function reprendre() {
  try {
    const entree = JSON.parse(readFileSync(0, "utf8") || "{}");
    initialiserLesReglages();
    const reglages = reglagesDe();
    const { racine, nom } = depotDe(entree.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), reglages.profils);
    const additionalContext = contexteDeReprise(racine, nom, reglages.humain);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }));
  } catch (panne) {
    process.stderr.write(`[reprise] panne, session ouverte sans reprise : ${panne}\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  reprendre();
}
