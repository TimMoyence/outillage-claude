#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { griefsDuLivrable, lotsDe } from "../skills/livrer/scripts/etat-du-lot.mjs";
import { depotDe } from "./depots.mjs";
import { ACTIVITE_MS, fichiersDuTour, fichiersTenusParLesVoisines, skillInvoquee, transcriptionDe } from "./fichiers-du-tour.mjs";
import { HUMAIN_PAR_DEFAUT, reglagesDe } from "./reglages.mjs";

const CITATIONS = [/```[\s\S]*?```/g, /`[^`\n]*`/g, /"[^"\n]*"/g, /^>.*$/gm];
const GUILLEMETS = [
  ["«", "»"],
  ["“", "”"],
];

const sansEntre = (texte, [ouvrant, fermant]) =>
  texte
    .split("\n")
    .map((ligne) => {
      const morceaux = ligne.split(ouvrant);
      return morceaux.slice(1).reduce((garde, morceau) => {
        const fin = morceau.indexOf(fermant);
        return fin === -1 ? `${garde}${ouvrant}${morceau}` : `${garde} ${morceau.slice(fin + 1)}`;
      }, morceaux[0]);
    })
    .join("\n");

export const proseDe = (message) =>
  GUILLEMETS.reduce(sansEntre, CITATIONS.reduce((texte, motif) => texte.replace(motif, " "), message));

const mots = (source) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "iu");
const debutDeMot = (source) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})`, "iu");

const QUESTION = "une question en prose";
const OFFRE = "une offre ou une attente";
const SEAU = "un seau de reste";
const RANGE = "un rouge rangé hors de soi";
const NON_MESURE = "une affirmation non mesurée";

const entourage = (prose, debut, longueur) =>
  prose.slice(Math.max(0, debut - 60), debut + longueur).replace(/\s+/g, " ").trim();

const parMotif = (motif, raison) => ({
  raison,
  trouve: (prose) => {
    const trouve = motif.exec(prose);
    return trouve === null ? null : entourage(prose, trouve.index, trouve[0].length);
  },
});

const AUTRUI = mots("autres? sessions?|sessions? voisines?|(?:la|une|d['’]une|de la) voisine");
const ROUGE = debutDeMot("rouge|rougi|échou|échec|cass|erreur|fail|KO(?![\\p{L}])|clone");
const REPARE = debutDeMot("corrig|répar|réglé|verdi");

const NEGATION = /(?:\bpas\b|\brien\b|\bjamais\b|\bsans\b|\bnon\b)[^.!?;\n]{0,20}$/iu;
const REPARE_PARTOUT = new RegExp(REPARE.source, `${REPARE.flags}g`);

const repareSansNegation = (bloc) =>
  [...bloc.matchAll(REPARE_PARTOUT)].some(({ index }) => !NEGATION.test(bloc.slice(Math.max(0, index - 30), index)));

const BLOCS = /\n\s*\n|\n(?=[ \t]*(?:[-*+]|\d+[.)])[ \t])/;

const rougeChezAutrui = {
  raison: RANGE,
  trouve: (prose) => {
    for (const bloc of prose.split(BLOCS)) {
      const phrase = bloc.split(/[.!?;\n]+/).find((p) => AUTRUI.test(p) && ROUGE.test(p));
      if (phrase !== undefined && !repareSansNegation(bloc)) return phrase.replace(/\s+/g, " ").trim();
    }
    return null;
  },
};

const FORMES = [
  parMotif(/\?(\s|$)/u, QUESTION),
  parMotif(
    mots(
      [
        "veux-tu|voulez-vous|souhaites-tu|souhaitez-vous|préfères-tu|préférez-vous|dis-moi|dites-moi",
        "si tu (?:le )?(?:veux|souhaites|préfères)|si vous (?:le )?(?:voulez|souhaitez|préférez)",
        "je peux (?:te|vous|aussi|lancer|enchaîner|ouvrir|proposer)|feu vert",
        "j['’]attends|ton accord|votre accord|ta validation|votre validation",
        "à (?:toi|vous) de (?:voir|choisir|trancher|lancer|jouer)|de (?:ton|votre) côté|(?:te|vous) revient|(?:te|vous) reviennent",
      ].join("|"),
    ),
    OFFRE,
  ),
  parMotif(
    mots(
      [
        "à arbitrer|à trancher|hors lot|hors (?:du )?périmètre|hors scope|points? ouverts?|à valider|choix de ma part",
        "écarts? à connaître|limites? connues?|restent? rouges?|flaky|intermittente?s?",
        "dans un second temps|ultérieurement|plus tard|(?:dans |lors d['’]|pour |à )une prochaine (?:session|PR|passe)|(?:à|dans|lors de) la prochaine (?:session|PR|passe)",
      ].join("|"),
    ),
    SEAU,
  ),
  parMotif(/^[ \t#*_-]*à savoir[ \t*_]*(?::|$)/imu, SEAU),
  parMotif(
    mots(
      [
        "pré-?existante?s?|hors de (?:mes|mon|ce|nos) lots?|hors (?:de )?mon diff|pas dans (?:mon|le) diff",
        "ne (?:vien|provien)(?:nen)?t pas de (?:mes|mon|nos|ce)|n['’](?:est|sont) pas (?:à moi|de moi|le mien|les miens|de mon fait)",
        "pas (?:de|dans) mon lot|(?:est|sont|étai(?:en)?t) à (?:une |d['’])autres? sessions?|existai(?:en)?t (?:déjà )?avant (?:ce|mon|le) lot",
      ].join("|"),
    ),
    RANGE,
  ),
  rougeChezAutrui,
  parMotif(
    mots("probablement|improbable|sans doute|a priori|normalement|en contrepartie|devrait (?:passer|marcher|fonctionner|suffire)"),
    NON_MESURE,
  ),
];

const citeUnFichierTenu = (bloc, tenu) => [...bloc.matchAll(/`([^`\n]+)`/g)].some(([, citation]) => tenu(citation));

export const refusDeLaReponse = (message, tenu = () => false, humain = HUMAIN_PAR_DEFAUT) => {
  const prose = proseDe(message);
  const proseSansTenus = proseDe(message.split(BLOCS).filter((bloc) => !citeUnFichierTenu(bloc, tenu)).join("\n\n"));
  const trouvees = FORMES.map(({ raison, trouve }) => ({ raison, extrait: trouve(raison === RANGE ? proseSansTenus : prose) })).filter(
    ({ extrait }) => extrait !== null,
  );
  if (trouvees.length === 0) return null;
  const raisons = trouvees.map(({ raison, extrait }) => `${raison} (« ${extrait} »)`).join(" ; ");
  return (
    `fin de tour refusée : ${raisons}. Une question à ${humain} se POSE par AskUserQuestion et ne porte que sur une décision produit, ` +
    "jamais sur quoi faire ni sur la suite. Ce qui reste se fait dans ce tour : tout rouge de la session ou d'avant elle se corrige. " +
    `Seul le rouge d'un fichier qu'une voisine active tient encore (écrit par elle, pas par toi, sa transcription ayant bougé depuis moins de ${ACTIVITE_MS / 60000} min) ` +
    "se laisse, cité par son chemin entre backticks. " +
    "Un passage long se lance en fond avec sa durée annoncée et se rapporte à sa fin. Une affirmation se mesure ou se retire. Réécris la réponse entière, sans ces formes : elle remplace la précédente, rien de ce qu'elle établissait ne se perd. Ou pose la question par l'outil."
  );
};

const VERDICT_LIVRE = /Verdict\s*:\s*LIVRÉ/;
const TASKLIST = /JSON\s*:\s*`?([^`\s]+\.tasklist\.json)`?/;

const tasklistDuRapport = (message) => (VERDICT_LIVRE.test(message) ? TASKLIST.exec(message)?.[1] : undefined);

export const refusDuLivre = (message, racine) => {
  if (!VERDICT_LIVRE.test(message)) return null;
  const chemin = tasklistDuRapport(message);
  if (!chemin || !existsSync(chemin))
    return "LIVRÉ sans task list lisible : le rapport cite `JSON : <chemin>.tasklist.json`, que `etat-du-lot.mjs` juge LIVRABLE.";
  const griefs = lotsDe(chemin).flatMap((lot) => griefsDuLivrable(lot, racine).map((grief) => `${lot.lot} · ${grief}`));
  return griefs.length === 0 ? null : `LIVRÉ refusé, la task list ne le porte pas : ${griefs.join(" ; ")}. Le travail continue jusqu'à LIVRABLE.`;
};

const CODE = /\.(?:[cm]?[jt]sx?|py|sh|sql|prisma|html|css|scss|vue|svelte|go|rs|java|kt|rb|php)$/;

export const rappelDeCloture = (ecrits, dupAst) => {
  if (!ecrits.some((chemin) => CODE.test(chemin))) return null;
  const duplication = dupAst ? "par `pnpm dup:ast`" : "si nécessaire par normalisation de l'AST";
  return (
    `Avant de clôturer, audite et revalide le code produit : fonctionnalités terminées, simplicité KISS/DRY, responsabilités claires, logique métier unique entre front et back et échanges par routes précisément typés. Recherche les duplications sémantiques, au-delà du texte ${duplication} ; centralise les calculs et leurs gardes, refactorise utilement et vérifie les comportements visibles ainsi que les cas limites des fonctions nouvelles. Corrige les écarts, relance les contrôles pertinents et signale les limites restantes ; supprime uniquement les task lists entièrement terminées lorsque la validation est acquise. Ce rappel n'exige ni commit ni push.`
  );
};

const exposeDupAst = (racine) => {
  try {
    return typeof JSON.parse(readFileSync(join(racine, "package.json"), "utf8")).scripts?.["dup:ast"] === "string";
  } catch {
    return false;
  }
};

const codeEcritDuTour = (entree, racine) => fichiersDuTour(transcriptionDe(entree)).filter((chemin) => chemin.startsWith(`${racine}/`));

const marque = (session) => join(tmpdir(), `garde-de-la-reponse-${String(session ?? "sans-session").replace(/[^\w-]/g, "_")}`);

function juger() {
  try {
    const entree = JSON.parse(readFileSync(0, "utf8"));
    const fichier = marque(entree.session_id);
    const relance = entree.stop_hook_active === true;
    const dejaRefusee = relance && existsSync(fichier);
    rmSync(fichier, { force: true });
    const message = String(entree.last_assistant_message ?? "");
    const racine = process.env.CLAUDE_PROJECT_DIR ?? entree.cwd ?? process.cwd();
    const depot = depotDe(entree.cwd ?? racine).racine;
    const refusDeLaProse = () => {
      const sousLivrer = skillInvoquee(transcriptionDe(entree), "livrer");
      const cloture = relance || sousLivrer || VERDICT_LIVRE.test(message) ? null : rappelDeCloture(codeEcritDuTour(entree, racine), exposeDupAst(depot));
      const tenus = fichiersTenusParLesVoisines(entree.transcript_path);
      const tenu = (citation) => tenus.has(resolve(depot, citation.replace(/(?::\d+)+$/, "")));
      return [refusDeLaReponse(message, tenu, reglagesDe().humain), cloture];
    };
    const refus = [...(dejaRefusee ? [] : refusDeLaProse()), refusDuLivre(message, depot)].filter((raison) => raison !== null);
    if (refus.length === 0) {
      const livree = tasklistDuRapport(message);
      if (livree) rmSync(livree, { force: true });
      return;
    }
    writeFileSync(fichier, "");
    process.stderr.write(`[garde-de-la-reponse] ${refus.join("\n\n")}\n`);
    process.exitCode = 2;
  } catch (panne) {
    process.stderr.write(`[garde-de-la-reponse] panne, réponse laissée passer : ${panne}\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  juger();
}
