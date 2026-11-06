import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const OUTILS_QUI_ECRIVENT = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const ouvreUnTour = (ligne) => {
  if (ligne.type !== "user" || ligne.isMeta || ligne.isCompactSummary) return false;
  const contenu = ligne.message?.content;
  if (typeof contenu === "string") return true;
  return Array.isArray(contenu) && !contenu.some((bloc) => bloc?.type === "tool_result");
};

export const transcriptionDe = (entree) => entree.agent_transcript_path ?? entree.transcript_path;

const PAS_DE_L_HUMAIN = /^\s*(?:<|\[|Another Claude session sent a message|Stop hook feedback)/;

const texteDe = (contenu) =>
  typeof contenu === "string"
    ? contenu
    : (contenu ?? []).filter((bloc) => bloc?.type === "text").map((bloc) => bloc.text).join("\n");

export const skillInvoquee = (transcription, nom) => {
  if (!transcription || !existsSync(transcription)) return false;
  const parCommande = new RegExp(`<command-name>/(?:[\\w-]+:)?${nom}</command-name>`);
  const parOutil = new RegExp(`^(?:[\\w-]+:)?${nom}$`);
  for (const brut of readFileSync(transcription, "utf8").split("\n")) {
    if (!brut.includes(nom)) continue;
    let ligne;
    try {
      ligne = JSON.parse(brut);
    } catch {
      continue;
    }
    const contenu = ligne.message?.content;
    if (ligne.type === "user" && parCommande.test(texteDe(contenu))) return true;
    if (ligne.type === "assistant" && Array.isArray(contenu) && contenu.some((bloc) => bloc?.type === "tool_use" && bloc.name === "Skill" && parOutil.test(bloc.input?.skill ?? "")))
      return true;
  }
  return false;
};

export const derniereDemande = (transcription) => {
  if (!transcription || !existsSync(transcription)) return "";
  let demande = "";
  for (const brut of readFileSync(transcription, "utf8").split("\n")) {
    if (!brut.includes('"type":"user"')) continue;
    let ligne;
    try {
      ligne = JSON.parse(brut);
    } catch {
      continue;
    }
    if (!ouvreUnTour(ligne)) continue;
    const texte = texteDe(ligne.message?.content).trim();
    if (texte !== "" && !PAS_DE_L_HUMAIN.test(texte)) demande = texte;
  }
  return demande;
};

const ecrituresDe = (transcription, duSeulTour) => {
  if (!transcription || !existsSync(transcription)) return [];
  let ecrits = new Set();
  for (const brut of readFileSync(transcription, "utf8").split("\n")) {
    if (!brut.includes('"type":"user"') && !brut.includes('"type":"tool_use"')) continue;
    let ligne;
    try {
      ligne = JSON.parse(brut);
    } catch {
      continue;
    }
    if (ouvreUnTour(ligne)) {
      if (duSeulTour) ecrits = new Set();
      continue;
    }
    if (ligne.type !== "assistant" || !Array.isArray(ligne.message?.content)) continue;
    for (const bloc of ligne.message.content) {
      const chemin = bloc?.input?.file_path ?? bloc?.input?.notebook_path;
      if (bloc?.type === "tool_use" && OUTILS_QUI_ECRIVENT.has(bloc.name) && chemin) ecrits.add(chemin);
    }
  }
  return [...ecrits];
};

export const fichiersDuTour = (transcription) => ecrituresDe(transcription, true);

export const ACTIVITE_MS = 30 * 60 * 1000;

const entreesDe = (dossier) => {
  try {
    return readdirSync(dossier, { withFileTypes: true });
  } catch {
    return [];
  }
};

const transcriptionsActives = (projets, maintenant) =>
  entreesDe(projets)
    .filter((entree) => entree.isDirectory())
    .flatMap((projet) =>
      entreesDe(join(projets, projet.name))
        .filter((entree) => entree.isFile() && entree.name.endsWith(".jsonl"))
        .map((entree) => join(projets, projet.name, entree.name)),
    )
    .filter((chemin) => maintenant - (statSync(chemin, { throwIfNoEntry: false })?.mtimeMs ?? 0) < ACTIVITE_MS);

export const fichiersTenusParLesVoisines = (transcription, maintenant = Date.now()) => {
  if (!transcription || !existsSync(transcription)) return new Set();
  const miens = new Set(ecrituresDe(transcription, false));
  return new Set(
    transcriptionsActives(dirname(dirname(transcription)), maintenant)
      .filter((chemin) => chemin !== transcription)
      .flatMap((chemin) => ecrituresDe(chemin, false))
      .filter((chemin) => !miens.has(chemin)),
  );
};
