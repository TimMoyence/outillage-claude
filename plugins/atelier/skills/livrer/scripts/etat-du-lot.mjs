#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AUDIT = ["shortstat", "duplications", "jumelles"];
const RISQUES_BREAKES = ["MONEY", "SECURITY", "TENANT"];
const PROPRIETE = /\bfc\.(?:assert|property|asyncProperty)\b|from\s+["'](?:fast-check|@fast-check\/[\w-]+)["']|@given\(/;

const cheminDe = (reference) => String(reference ?? "").split(" :: ")[0].trim();

const empreinteDuFichier = (racine, chemin) => {
  if (!existsSync(join(racine, chemin))) return "absent";
  const contenu = readFileSync(join(racine, chemin));
  return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${contenu.length}\0`), contenu])).digest("hex");
};

const empreinteDes = (racine, chemins, entete = "") => {
  const hache = createHash("sha256").update(entete);
  for (const chemin of [...new Set(chemins)].filter(Boolean).sort()) hache.update(`${chemin}:${empreinteDuFichier(racine, chemin)}\n`);
  return hache.digest("hex").slice(0, 16);
};

const fichiersDeLaStep = (step) => [cheminDe(step.test), cheminDe(step.proprietes), ...(step.prod ?? [])];

export const empreinteDeLaStep = (step, racine) => empreinteDes(racine, fichiersDeLaStep(step), `cmd:${step.cmd ?? ""}\n`);

export const empreinteDuLot = (lot, racine) =>
  empreinteDes(racine, [...(lot.carte?.prod ?? []), ...(lot.carte?.tests ?? []), ...(lot.steps ?? []).flatMap(fichiersDeLaStep)]);

const griefsDuContrat = ({ mode, contrat = {} }) =>
  mode !== "feature"
    ? []
    : [
        ...(contrat.valide ? [] : ["contrat non validé par l'humain (cadrage)"]),
        ...(contrat.critique?.status === "CLEAR" ? [] : ["contrat non critiqué CLEAR par le breaker en mode contrat"]),
      ];

const EN_TETE = "^[\\s>❯×✖]*";
const LIAISON_NETTE = "\\(0 ?, ?[\\w$]+\\.[\\w$]+\\)|(?:__vite_ssr_import_\\d+__|__vi_import_\\d+__)\\.[\\w$]+|_[\\w$]+\\.default";
const LIAISON_NUE = "(?:[\\w$]+_\\d+|import_[\\w$]+)\\.[\\w$]+";
const LIAISON_D_IMPORT_ABSENTE = `(?:${LIAISON_NETTE}) is not a (?:function|constructor)|(?:${LIAISON_NUE}) is not a constructor|Class extends value undefined is not a constructor|Element type is invalid: .+ but got: undefined|NG0919: Cannot read @\\w+ metadata`;
const CHARGEMENT = new RegExp(
  `${EN_TETE}(?:ReferenceError|SyntaxError)\\b|${LIAISON_D_IMPORT_ABSENTE}|ERR_MODULE_NOT_FOUND|Cannot find module|Failed to (?:load|resolve)|Transform failed|error TS\\d+`,
  "m",
);
const ASSERTION = new RegExp(
  `${EN_TETE}(?:AssertionError|(?:Error:\\s*)?expect\\((?:[^()]|\\([^()]*\\))*\\)\\.(?:not\\.|resolves\\.|rejects\\.)*to\\w+|Error: Snapshot .+ mismatched|Error: expected number of assertions)`,
  "m",
);

export const causeDuRouge = (journal) => (CHARGEMENT.test(journal) ? "chargement" : ASSERTION.test(journal) ? "assertion" : "inconnue");

const ecartALAttendu = (mode, { exit, cause }) => {
  if (mode === "refactor") return exit === 0 ? null : "la contre-preuve rougit sur la base, le test ne fige pas l'existant";
  if (exit === 0) return "la contre-preuve passe sans le code de la step, le test ne prouve pas la règle";
  return cause === "chargement" ? "la contre-preuve rougit au chargement, pas sur l'assertion de la règle" : null;
};

const geleeSousLaV2 = (step) => !Object.hasOwn(step, "avant") && !step.contre_preuve;

const griefsDeLaContrePreuve = (step, mode, racine) => {
  if ((step.prod ?? []).length === 0 || geleeSousLaV2(step)) return [];
  const { contre_preuve: contrePreuve } = step;
  if (!contrePreuve) return [`${step.id} sans contre-preuve (ETAT <task list> --contre-preuve ${step.id})`];
  const ecart = ecartALAttendu(mode, contrePreuve);
  return [
    ...(ecart === null ? [] : [`${step.id} : ${ecart}`]),
    ...(contrePreuve.empreinte === empreinteDeLaStep(step, racine) ? [] : [`${step.id} a bougé depuis sa contre-preuve`]),
  ];
};

const griefsDesRisques = (step, racine) => {
  const risques = (step.risques ?? []).filter((risque) => RISQUES_BREAKES.includes(risque));
  if (risques.length === 0) return [];
  const nommes = `${step.id} ${risques.join("+")}`;
  const proprietes = cheminDe(step.proprietes);
  return [
    ...(!risques.includes("MONEY")
      ? []
      : !proprietes
        ? [`${nommes} sans test de propriétés (fast-check) : bornes, zéro, arrondis, sommes qui se recoupent`]
        : existsSync(join(racine, proprietes)) && PROPRIETE.test(readFileSync(join(racine, proprietes), "utf8"))
          ? []
          : [`${step.id} : ${proprietes} ne contient aucune propriété (fast-check)`]),
    ...(step.breaker?.status !== "CLEAR"
      ? [`${nommes} sans breaker CLEAR sur la step`]
      : step.breaker.empreinte === empreinteDeLaStep(step, racine)
        ? []
        : [`${step.id} a bougé depuis le CLEAR de son breaker`]),
  ];
};

const griefsDeLaStep = (step, mode, racine) => {
  if (step.etat !== "vert") return [`${step.id} ${step.etat ?? "sans état"}`];
  return [
    ...(step.preuve ? [] : [`${step.id} vert sans preuve`]),
    ...(!step.sha_test
      ? [`${step.id} sans sha_test`]
      : step.sha_test === empreinteDuFichier(racine, cheminDe(step.test))
        ? []
        : [`${step.id} : le test a bougé depuis son gel`]),
    ...griefsDeLaContrePreuve(step, mode, racine),
    ...griefsDesRisques(step, racine),
  ];
};

const griefsDeLaFin = (lot, racine) => {
  const { audit, breaker } = lot.final ?? {};
  const manquants = AUDIT.filter((champ) => !audit?.[champ]);
  return [
    ...(manquants.length === 0 ? [] : [`audit incomplet : ${manquants.join(", ")}`]),
    ...(breaker?.status !== "CLEAR"
      ? ["breaker sans CLEAR sur l'état final"]
      : breaker.empreinte === empreinteDuLot(lot, racine)
        ? []
        : ["le lot a bougé depuis le CLEAR du breaker : relance-le sur le delta"]),
  ];
};

export const griefsDuLivrable = (lot, racine) => [
  ...griefsDuContrat(lot),
  ...((lot.steps ?? []).length === 0 ? ["aucune step"] : lot.steps.flatMap((step) => griefsDeLaStep(step, lot.mode, racine))),
  ...griefsDeLaFin(lot, racine),
];

const documentDe = (chemin) => JSON.parse(readFileSync(chemin, "utf8"));

const lotsDuDocument = (document) => (Array.isArray(document.lots) ? document.lots : [document]);

export const lotsDe = (chemin) => lotsDuDocument(documentDe(chemin));

const racineDe = (dossier) => spawnSync("git", ["-C", dossier, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout?.trim() || dossier;

const encode = (chemin) => (existsSync(chemin) ? readFileSync(chemin).toString("base64") : null);

const ecrireOuRetirer = (chemin, contenu) => (contenu === null ? rmSync(chemin, { force: true }) : writeFileSync(chemin, Buffer.from(contenu, "base64")));

const sauvegardeDe = (tasklist) => `${tasklist}.restauration.json`;

const restaurer = (sauvegarde) => {
  if (!existsSync(sauvegarde)) return [];
  const fichiers = JSON.parse(readFileSync(sauvegarde, "utf8"));
  fichiers.forEach(({ chemin, actuel }) => ecrireOuRetirer(chemin, actuel));
  rmSync(sauvegarde, { force: true });
  return fichiers.map(({ chemin }) => chemin);
};

const restaurerUneContrePreuveInterrompue = (tasklist) => restaurer(sauvegardeDe(tasklist));

const stepDe = (document, id) => {
  const lot = lotsDuDocument(document).find((candidat) => (candidat.steps ?? []).some((step) => step.id === id));
  return { lot, step: lot?.steps.find((candidate) => candidate.id === id) };
};

const geler = (chemin, id, racine) => {
  const document = documentDe(chemin);
  const { lot, step } = stepDe(document, id);
  if (!step) return { sortie: `${id} : aucune step de ce nom dans ${chemin}\n`, code: 2 };
  const absent = lot.mode === "refactor" ? undefined : (step.prod ?? []).find((fichier) => !existsSync(join(racine, fichier)));
  if (absent) return { sortie: `${id} : ${absent} n'existe pas : un module neuf se gèle par son squelette exporté qui rend une valeur neutre\n`, code: 2 };
  step.sha_test = empreinteDuFichier(racine, cheminDe(step.test));
  step.avant = Object.fromEntries((step.prod ?? []).map((fichier) => [fichier, encode(join(racine, fichier))]));
  writeFileSync(chemin, `${JSON.stringify(document, null, 2)}\n`);
  return { sortie: `${id} gelé : sha_test ${step.sha_test}, état d'avant de ${Object.keys(step.avant).length} fichier(s)\n`, code: 0 };
};

const jouerSurLAvant = (racine, step, sauvegarde) => {
  const horsDuGel = (step.prod ?? []).find((fichier) => !Object.hasOwn(step.avant, fichier));
  if (horsDuGel) throw new Error(`${horsDuGel} n'est pas dans l'état d'avant de ${step.id} : regèle la step`);
  const prod = step.prod.map((fichier) => ({ chemin: join(racine, fichier), avant: step.avant[fichier] }));
  writeFileSync(sauvegarde, JSON.stringify(prod.map(({ chemin }) => ({ chemin, actuel: encode(chemin) }))));
  const journal = join(mkdtempSync(join(tmpdir(), "contre-preuve-")), `${step.id}.log`);
  const sortie = openSync(journal, "w");
  try {
    prod.forEach(({ chemin, avant }) => ecrireOuRetirer(chemin, avant));
    const passage = spawnSync("bash", ["-c", step.cmd], { cwd: racine, stdio: ["ignore", sortie, sortie] });
    return { exit: passage.status, coupure: passage.signal ?? passage.error?.code, journal };
  } finally {
    closeSync(sortie);
    restaurer(sauvegarde);
  }
};

const contrePreuve = (chemin, id, racine) => {
  const document = documentDe(chemin);
  const { lot, step } = stepDe(document, id);
  if (!step) return { sortie: `${id} : aucune step de ce nom dans ${chemin}\n`, code: 2 };
  if (!step.cmd) return { sortie: `${id} : la contre-preuve demande cmd dans la step\n`, code: 2 };
  if (!step.avant) return { sortie: `${id} n'a pas d'état d'avant : la step se gèle par --gel ${id} avant la production\n`, code: 2 };
  let passage;
  try {
    passage = jouerSurLAvant(racine, step, sauvegardeDe(chemin));
  } catch (panne) {
    return { sortie: `${id} contre-preuve impossible : ${panne.message} ; rien n'est touché ni écrit\n`, code: 2 };
  }
  const { exit, coupure, journal } = passage;
  if (exit === null) return { sortie: `${id} contre-preuve : ${step.cmd} coupée par ${coupure} (journal ${journal}) : elle n'est pas jouée, rien n'est écrit\n`, code: 2 };
  const cause = exit === 0 ? null : causeDuRouge(readFileSync(journal, "utf8"));
  step.contre_preuve = { exit, cause, empreinte: empreinteDeLaStep(step, racine) };
  writeFileSync(chemin, `${JSON.stringify(document, null, 2)}\n`);
  const ecart = ecartALAttendu(lot.mode, step.contre_preuve);
  const rouge =
    cause === null ? "" : `, rouge ${{ chargement: "de chargement", assertion: "d'assertion", inconnue: "de cause inconnue : vérifie qu'il vient de l'assertion de la règle" }[cause]}`;
  return { sortie: `${id} contre-preuve : ${step.cmd} → EXIT=${exit}${rouge} (journal ${journal})${ecart === null ? "" : ` — ${ecart}`}\n`, code: ecart === null ? 0 : 1 };
};

const empreinteDeLId = (lots, id, racine) => {
  const step = lots.flatMap((lot) => lot.steps ?? []).find((candidate) => candidate.id === id);
  return step ? empreinteDeLaStep(step, racine) : `${id} : aucune step de ce nom`;
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [chemin, option, id] = process.argv.slice(2);
  const racine = racineDe(process.cwd());
  const restaures = restaurerUneContrePreuveInterrompue(chemin);
  if (restaures.length > 0) process.stdout.write(`restauré après une contre-preuve interrompue : ${restaures.join(", ")}\n`);
  const commandes = { "--gel": geler, "--contre-preuve": contrePreuve };
  if (Object.hasOwn(commandes, option)) {
    const { sortie, code } = commandes[option](chemin, id, racine);
    process.stdout.write(sortie);
    process.exit(code);
  }
  const lots = lotsDe(chemin);
  if (option === "--empreinte") {
    process.stdout.write(`${id ? empreinteDeLId(lots, id, racine) : lots.map((lot) => empreinteDuLot(lot, racine)).join("\n")}\n`);
  } else {
    const griefs = lots.flatMap((lot) => griefsDuLivrable(lot, racine).map((grief) => `${lot.lot} · ${grief}`));
    process.stdout.write(griefs.length === 0 ? "LIVRABLE\n" : `${griefs.join("\n")}\n`);
    process.exitCode = griefs.length === 0 ? 0 : 1;
  }
}
