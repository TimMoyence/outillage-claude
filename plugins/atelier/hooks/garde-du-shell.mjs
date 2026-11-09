#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { PROFIL_GENERIQUE, depotDe } from "./depots.mjs";
import { derniereDemande, transcriptionDe } from "./fichiers-du-tour.mjs";
import { HUMAIN_PAR_DEFAUT, reglagesDe } from "./reglages.mjs";

const de = (humain) => (/^[aeiouyàâäéèêëîïôöùûü]/iu.test(humain) ? `d'${humain}` : `de ${humain}`);

const APRES_UN_DOLLAR = /(?:^|[^$])(?:\$\$)*\$$/;
const LITTERALES = new Set(["'", "$'"]);
const CITEES = new Set(["'", "$'", '"', "'?"]);
const ENTRE_GUILLEMETS = new Set(['"', '${"']);
const COMMENTABLES = new Set([undefined, "$(", "("]);
const PARENTHESES = new Set(["$(", "("]);
const AMBIGUITES = {
  accolade:
    "une accolade `{` dans `${…}` se lit autrement sous bash, qui ferme au premier `}`, que sous zsh, qui l'imbrique : la garde ne sait plus où ferment les groupes. Cite la valeur (`\"${v:-{}\"`).",
  apostrophe:
    "une apostrophe dans `\"${…}\"` se lit autrement sous bash, qui y protège `}` et `\"`, que sous zsh, qui la laisse littérale : la garde ne sait plus où ferme la valeur. Sors la valeur des guillemets (`${v:-'a}b'}`), ou échappe le caractère (`\"${v:-a\\}b}\"`).",
  grave: "un accent grave échappé dans un accent grave ouvre une substitution imbriquée que la garde ne lit pas : écris `$( … )`.",
  barre:
    "une barre oblique inverse devant `\\` ou `$` dans un accent grave s'y retire avant que le corps se lise, ce que la garde ne suit pas : écris `$( … )`.",
};

const lireLaCommande = (commande) => {
  let masque = "";
  let lu = "";
  let ambigu = null;
  const pile = [];
  const corps = [];
  const cache = () => pile.some(({ genre, extrait }) => extrait || CITEES.has(genre));
  const ecrire = (texte, visible = texte) => {
    lu += texte;
    masque += cache() ? "_".repeat(texte.length) : visible;
  };
  const ouvrir = (genre, rang) => {
    ecrire(commande[rang]);
    const extrait = (genre === "`" || (genre === "$(" && cache())) && !pile.some((entree) => entree.extrait);
    pile.push({ genre, debut: rang + 1, extrait });
  };
  const fermer = (genre, rang, visible) => {
    let entree = pile.pop();
    while (entree.genre !== genre) entree = pile.pop();
    if (entree.extrait) corps.push({ debut: entree.debut, fin: rang });
    ecrire(commande[rang], visible);
  };
  for (let rang = 0; rang < commande.length; rang += 1) {
    const [caractere, suivant] = [commande[rang], commande[rang + 1]];
    const sommet = pile.at(-1)?.genre;
    const dansUnGrave = pile.some(({ genre }) => genre === "`");
    const dollar = APRES_UN_DOLLAR.test(lu);
    if (caractere === "\\" && suivant !== undefined && (sommet !== "'" || (dansUnGrave && "`\\".includes(suivant)))) {
      if (dansUnGrave && suivant === "`" && !LITTERALES.has(sommet)) ambigu ??= AMBIGUITES.grave;
      if (dansUnGrave && "\\$".includes(suivant) && sommet !== "'") ambigu ??= AMBIGUITES.barre;
      ecrire("__", !cache() && suivant === "\n" ? "  " : "__");
      rang += 1;
    } else if (caractere === "`" && dansUnGrave) fermer("`", rang);
    else if (LITTERALES.has(sommet)) {
      if (caractere === "'") fermer(sommet, rang);
      else ecrire(caractere);
    } else if (caractere === "#" && COMMENTABLES.has(sommet) && !dansUnGrave && /^$|\s$/.test(lu.slice(-1))) {
      const fin = commande.indexOf("\n", rang);
      const bout = fin === -1 ? commande.length : fin;
      ecrire(" ".repeat(bout - rang));
      rang = bout - 1;
    } else if (caractere === "`") ouvrir("`", rang);
    else if (caractere === "(" && dollar) ouvrir("$(", rang);
    else if (caractere === "{" && dollar) ouvrir(ENTRE_GUILLEMETS.has(sommet) ? '${"' : "${", rang);
    else if (sommet === "'?") {
      if (caractere === "'") fermer("'?", rang);
      else {
        if ('}"'.includes(caractere)) ambigu ??= AMBIGUITES.apostrophe;
        ecrire(caractere);
      }
    } else if (sommet === '"') {
      if (caractere === '"') fermer('"', rang);
      else ecrire(caractere);
    } else if (sommet === '${"') {
      if (caractere === "}") fermer('${"', rang);
      else if (caractere === '"') ouvrir('"', rang);
      else if (caractere === "'") ouvrir("'?", rang);
      else ecrire(caractere);
    } else if (caractere === "'" || caractere === '"') ouvrir(caractere === "'" && dollar ? "$'" : caractere, rang);
    else if (caractere === "(" && PARENTHESES.has(sommet)) ouvrir("(", rang);
    else if (caractere === ")" && PARENTHESES.has(sommet)) fermer(sommet, rang);
    else if (caractere === "{" && sommet === "${") {
      ambigu ??= AMBIGUITES.accolade;
      ouvrir("${", rang);
    } else if (caractere === "}" && sommet === "${") fermer("${", rang, "_");
    else ecrire(caractere);
  }
  return { masque, corps, ambigu };
};

export const masquer = (commande) => lireLaCommande(commande).masque;

const sansCitation = (mot) => /^(["'])(.*)\1$/s.exec(mot)?.[2] ?? mot.replace(/\\(.)/gs, "$1");

const REPERTOIRES_TEMPORAIRES = [tmpdir(), ...["/tmp", "/private/tmp"].map((racine) => `${racine}/claude-${process.getuid()}`)];

const dansLeRepertoireTemporaire = (cible) =>
  REPERTOIRES_TEMPORAIRES.some((racine) => {
    const chemin = relative(racine, resolve(cible));
    return chemin !== "" && !chemin.startsWith("..") && !isAbsolute(chemin);
  });

const AFFECTATION = /(?:^|[\s;&|(])([A-Za-z_]\w*)=("[^"]*"|'[^']*'|\$\([^)]*\)|[^\s;&|]*)/g;

const affectationsDe = (commande, masque) =>
  [...masque.matchAll(AFFECTATION)].map((trouve) => {
    const debut = trouve.index + trouve[0].length - trouve[2].length;
    return { nom: trouve[1], valeur: commande.slice(debut, debut + trouve[2].length), position: trouve.index };
  });

const developpe = (mot, variables) => {
  const brut = sansCitation(mot);
  if (/^\$\(\s*mktemp\b/.test(brut)) return `${tmpdir()}/mktemp`;
  return brut.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (tel, nom) => variables.get(nom) ?? process.env[nom] ?? tel);
};

const variablesAvant = (affectations, position) => {
  const variables = new Map();
  for (const { nom, valeur, position: ici } of affectations) {
    if (ici >= position) break;
    variables.set(nom, developpe(valeur, variables));
  }
  return variables;
};

const ignoreeParGit = (cible, { racine, cwd }) => {
  const chemin = resolve(cwd, cible);
  return (
    !relative(racine, chemin).startsWith("..") &&
    spawnSync("git", ["-C", racine, "check-ignore", "-q", chemin], { stdio: "ignore" }).status === 0
  );
};

const redirectionHorsTemporaire = (commande, masque, ou) => {
  const affectations = affectationsDe(commande, masque);
  for (const trouve of masque.matchAll(/\d?>>?\s*([^\s;|()<>]+)/g)) {
    const debut = trouve.index + trouve[0].length - trouve[1].length;
    const cible = developpe(commande.slice(debut, debut + trouve[1].length), variablesAvant(affectations, trouve.index));
    if (cible === "/dev/null" || cible.startsWith("&")) continue;
    const [fixe] = cible.split("$");
    if (fixe !== "" && dansLeRepertoireTemporaire(`${fixe}x`)) continue;
    if (fixe === cible && ou !== null && ignoreeParGit(cible, ou)) continue;
    return cible;
  }
  return null;
};

const motsDe = (commande, masque, debut, fin) =>
  [...masque.slice(debut, fin).matchAll(/\S+/g)].map((trouve) => {
    const ici = debut + trouve.index;
    return { masque: trouve[0], valeur: sansCitation(commande.slice(ici, ici + trouve[0].length)), debut: ici };
  });

const substitutionsDe = (commande, corps, segment) =>
  corps
    .filter(({ debut }) => debut >= segment.debut && debut < segment.fin)
    .flatMap(({ debut, fin }) =>
      segmentsDe(commande.slice(debut, fin)).map((interne) => ({
        ...interne,
        mots: interne.mots.map((mot) => ({ ...mot, debut: mot.debut + debut })),
        profondeur: segment.profondeur + 1 + interne.profondeur,
        horsChaine: true,
      })),
    );

const segmentsDe = (commande, { masque, corps } = lireLaCommande(commande)) => {
  const segments = [];
  let debut = 0;
  let avant = "";
  let profondeur = 0;
  const clore = (fin, lien, longueur = lien.length) => {
    const mots = motsDe(commande, masque, debut, fin);
    segments.push({ mots, texte: commande.slice(debut, fin), lien, avant, profondeur, debut, fin });
    debut = fin + longueur;
    if (mots.length > 0 || lien !== "\n") avant = lien;
    profondeur = Math.max(0, profondeur + (lien === "(" ? 1 : lien === ")" ? -1 : 0));
  };
  for (let rang = 0; rang < masque.length; rang += 1) {
    const [precedent, caractere, suivant] = [masque.charAt(rang - 1), masque.charAt(rang), masque.charAt(rang + 1)];
    if ((caractere === "|" || caractere === "&") && suivant === caractere) {
      clore(rang, caractere + suivant);
      rang += 1;
    } else if (caractere === "|" && suivant === "&") {
      clore(rang, "|", 2);
      rang += 1;
    } else if ((caractere === "|" && precedent !== ">") || "();\n".includes(caractere) || (caractere === "&" && precedent !== ">" && suivant !== ">")) clore(rang, caractere);
  }
  clore(masque.length, "");
  return segments.filter((segment) => segment.mots.length > 0).flatMap((segment) => [...substitutionsDe(commande, corps, segment), segment]);
};

const PRECOMMANDES = new Set(["rtk", "proxy", "time", "env", "nice", "command", "builtin", "noglob", "exec", "do", "then", "else", "elif", "if", "while", "until", "!", "{"]);
const ENVELOPPES = new Map([
  ["caffeinate", { aValeur: new Set(["-t", "-w"]), positionnels: 0 }],
  ["nohup", { aValeur: new Set(), positionnels: 0 }],
  ["timeout", { aValeur: new Set(["-s", "--signal", "-k", "--kill-after"]), positionnels: 1 }],
  ["gtimeout", { aValeur: new Set(["-s", "--signal", "-k", "--kill-after"]), positionnels: 1 }],
]);
const REDIRECTION = /^(\d*|&)(>>?|<)/;
const OPERATEUR_DE_REDIRECTION = /^(\d*|&)(>>?|<)&?$/;

const declareUneFonction = (mots) => mots[0]?.valeur === "function";

const sansDeclaration = (mots) => (declareUneFonction(mots) ? mots.slice(2) : mots);

const lireCommande = (entree) => {
  const mots = sansDeclaration(entree);
  let rang = 0;
  const affectations = [];
  while (rang < mots.length && (PRECOMMANDES.has(mots[rang].valeur) || /^[A-Za-z_]\w*=/.test(mots[rang].masque))) {
    if (!PRECOMMANDES.has(mots[rang].valeur)) affectations.push(mots[rang].masque.split("=")[0]);
    rang += 1;
  }
  const enveloppe = ENVELOPPES.get(mots[rang]?.valeur);
  if (enveloppe !== undefined) {
    let suite = rang + 1;
    while (suite < mots.length && mots[suite].valeur.startsWith("-")) suite += enveloppe.aValeur.has(mots[suite].valeur) ? 2 : 1;
    suite += enveloppe.positionnels;
    if (suite < mots.length) {
      const interne = lireCommande(mots.slice(suite));
      return { ...interne, affectations: [...affectations, ...interne.affectations] };
    }
  }
  const args = [];
  for (let suite = rang + 1; suite < mots.length; suite += 1) {
    if (OPERATEUR_DE_REDIRECTION.test(mots[suite].masque)) suite += 1;
    else if (!REDIRECTION.test(mots[suite].masque)) args.push(mots[suite]);
  }
  return { nom: mots[rang]?.valeur ?? "", tete: mots[rang], args, valeurs: args.map((mot) => mot.valeur), affectations };
};

const OPTIONS_GIT_A_VALEUR = new Set(["-C", "-c", "--git-dir", "--work-tree", "--exec-path", "--namespace", "--config-env", "--attr-source"]);

const lireGit = (commande) => {
  if (commande.nom !== "git") return null;
  const { valeurs } = commande;
  let rang = 0;
  const chemins = [];
  while (rang < valeurs.length && valeurs[rang].startsWith("-")) {
    if (valeurs[rang] === "-C") chemins.push(valeurs[rang + 1] ?? "");
    rang += OPTIONS_GIT_A_VALEUR.has(valeurs[rang]) ? 2 : 1;
  }
  return { verbe: valeurs[rang] ?? "", options: valeurs.slice(0, rang), args: valeurs.slice(rang + 1), chemins };
};

const deplacer = (ici, chemin) => {
  if (/[$`]/.test(chemin)) return null;
  const developpe = chemin === "~" || chemin.startsWith("~/") ? join(homedir(), chemin.slice(1)) : chemin;
  return isAbsolute(developpe) ? resolve(developpe) : ici === null ? null : resolve(ici, developpe);
};

const cibleDuCd = (valeurs, ici) => (valeurs.length === 1 && !valeurs[0].startsWith("-") ? deplacer(ici, valeurs[0]) : null);

const OPTIONS_PNPM_A_VALEUR = new Set(["-C", "--dir", "--filter", "-F", "--filter-prod", "--workspace-dir"]);

const lirePnpm = (commande) => {
  if (commande.nom !== "pnpm") return null;
  const { valeurs } = commande;
  let rang = 0;
  let cible = null;
  let recursif = false;
  while (rang < valeurs.length && valeurs[rang].startsWith("-")) {
    const [option] = valeurs[rang].split("=");
    if (["-C", "--dir"].includes(option)) cible ??= "dossier";
    if (["--filter", "-F", "--filter-prod"].includes(option)) cible = "filtre";
    if (["-r", "--recursive"].includes(option)) recursif = true;
    rang += OPTIONS_PNPM_A_VALEUR.has(valeurs[rang]) ? 2 : 1;
  }
  const decalage = valeurs[rang] === "run" ? 1 : 0;
  return { script: valeurs[rang + decalage] ?? "", reste: valeurs.slice(rang + decalage + 1), cible, recursif };
};

const OUTILS_A_VERDICT = new Set([
  "vitest", "jest", "tsc", "eslint", "biome", "prettier", "turbo", "playwright", "knip", "jscpd", "semgrep", "gitleaks",
  "depcruise", "stryker", "lhci", "lefthook", "commitlint", "prisma", "ng",
]);

const outilEffectif = (commande) => {
  const { valeurs } = commande;
  if (["npx", "pnpx", "bunx"].includes(commande.nom)) {
    const rang = valeurs.findIndex((valeur) => !valeur.startsWith("-"));
    return { outil: valeurs[rang] ?? "", args: valeurs.slice(rang + 1) };
  }
  const pnpm = lirePnpm(commande);
  if (pnpm && ["exec", "dlx"].includes(pnpm.script)) return { outil: pnpm.reste[0]?.split("/").pop() ?? "", args: pnpm.reste.slice(1) };
  if (pnpm && OUTILS_A_VERDICT.has(pnpm.script)) return { outil: pnpm.script, args: pnpm.reste };
  return { outil: commande.nom.split("/").pop(), args: valeurs };
};

const HOOK_GIT = /(^|\/)\.husky\/[\w-]+$/;

const lanceUnHookGit = (commande) => {
  if (HOOK_GIT.test(commande.nom) || (["sh", "bash", "zsh"].includes(commande.nom) && HOOK_GIT.test(commande.valeurs[0] ?? ""))) return true;
  const { outil, args } = outilEffectif(commande);
  return outil === "lefthook" && args[0] === "run";
};

const SCRIPTS_A_VERDICT =
  /^(test|lint|typecheck|build|controles|dup|duplication|e2e|knip|sca|sast|audit|doublons|db:|biome|deadcode|deps:|secrets|gate:|lhci|docker:tier|purge:verify|migration:|licenses:|artifacts:|data:)|:check$/;
const SCRIPTS_DE_GATE = /(^|\/)scripts\/(gate-|audit-|verify-|validate-|check-|count-design-debt)/;

const estUnVerdict = (commande) => {
  const pnpm = lirePnpm(commande);
  if (pnpm !== null && SCRIPTS_A_VERDICT.test(pnpm.script)) return true;
  if (OUTILS_A_VERDICT.has(outilEffectif(commande).outil) || lanceUnHookGit(commande)) return true;
  const git = lireGit(commande);
  return (
    (commande.nom === "node" && commande.valeurs.includes("--test")) ||
    (["node", "bash", "sh", "python3", "python"].includes(commande.nom) && SCRIPTS_DE_GATE.test(commande.valeurs[0] ?? "")) ||
    (commande.nom === "docker" && commande.valeurs.includes("build")) ||
    (git !== null && ["push", "commit"].includes(git.verbe))
  );
};

const positionnels = (args, aValeur) => {
  const trouves = [];
  for (let rang = 0; rang < args.length; rang += 1) {
    if (aValeur.has(args[rang])) rang += 1;
    else if (!args[rang].startsWith("-")) trouves.push(args[rang]);
  }
  return trouves;
};

const VITEST_A_VALEUR = new Set(["-t", "--testNamePattern", "--project", "--reporter", "-c", "--config", "-r", "--root", "--dir", "--shard", "--outputFile", "--pool", "--environment", "--exclude", "--mode", "--maxWorkers", "--bail", "--retry", "--testTimeout"]);
const JEST_A_VALEUR = new Set(["-c", "--config", "-t", "--testNamePattern", "--testPathPattern", "--testPathIgnorePatterns", "--selectProjects", "--maxWorkers", "-w", "--coverageDirectory", "--reporters", "--testTimeout", "--rootDir", "--coverageReporters", "--collectCoverageFrom", "--outputFile", "--shard", "--seed"]);
const ESLINT_A_VALEUR = new Set(["-c", "--config", "-f", "--format", "-o", "--output-file", "--rule", "--ext", "--max-warnings", "--cache-location", "--ignore-pattern", "--parser", "--plugin"]);
const PLAYWRIGHT_A_VALEUR = new Set(["-c", "--config", "-g", "--grep", "--grep-invert", "--project", "-j", "--workers", "--reporter", "--retries", "--repeat-each", "--timeout", "--max-failures", "--output", "--shard"]);
const SOUS_COMMANDES_VITEST = new Set(["run", "related", "watch", "dev", "bench"]);
const SOUS_COMMANDES_BIOME = new Set(["check", "format", "lint", "ci"]);

const visePeuDeFichiers = (args, aValeur, sousCommandes = new Set()) => {
  const fichiers = positionnels(args, aValeur).filter((mot) => !sousCommandes.has(mot));
  return fichiers.length > 0 && !fichiers.includes(".");
};

const configurationDe = (args) => {
  const rang = args.findIndex((arg) => arg === "-c" || arg === "--config");
  if (rang !== -1) return args[rang + 1] ?? "";
  return args.find((arg) => arg.startsWith("--config="))?.slice("--config=".length) ?? "";
};

const suitePlaywright = (args) => {
  const [sousCommande, ...fichiers] = positionnels(args, PLAYWRIGHT_A_VALEUR);
  if (sousCommande !== "test" || fichiers.length > 0) return false;
  if (args.some((arg) => ["-g", "--grep"].includes(arg) || arg.startsWith("--grep="))) return false;
  const configuration = configurationDe(args);
  return configuration === "" || /(^|\/)playwright\.config\.\w+$/.test(configuration);
};

const suiteDeLOutil = ({ outil, args }) => {
  if (outil === "vitest") return !visePeuDeFichiers(args, VITEST_A_VALEUR, SOUS_COMMANDES_VITEST) && !configurationDe(args).includes("integration");
  if (outil === "jest") return !visePeuDeFichiers(args, JEST_A_VALEUR);
  if (outil === "eslint") return !visePeuDeFichiers(args, ESLINT_A_VALEUR);
  if (outil === "biome") return args.some((arg) => ["--write", "--fix", "--apply"].includes(arg)) && !visePeuDeFichiers(args, new Set(), SOUS_COMMANDES_BIOME);
  if (outil === "playwright") return suitePlaywright(args);
  if (outil !== "turbo") return false;
  const filtre = args.some((arg) => arg.startsWith("--filter") || arg === "-F");
  return !filtre || positionnels(args, new Set(["--filter", "-F"])).some((tache) => /^(test|lint)(:|$)/.test(tache));
};

const suiteDuScript = (pnpm, permis) => {
  if (permis.includes(pnpm.script)) return false;
  if (/^(test|lint|e2e)(:|$)/.test(pnpm.script)) return true;
  if (/^(typecheck|build)(:|$)/.test(pnpm.script)) return pnpm.cible === null || pnpm.recursif;
  return pnpm.script === "biome:format" && pnpm.reste.length === 0;
};

const estUneSuite = (commande, permis) => {
  const pnpm = lirePnpm(commande);
  return (pnpm !== null && suiteDuScript(pnpm, permis)) || suiteDeLOutil(outilEffectif(commande)) || lanceUnHookGit(commande);
};

const segmentsAvantUnCommit = (segments) => {
  const marques = new Set();
  let versUnCommit = false;
  for (let rang = segments.length - 1; rang >= 0; rang -= 1) {
    const segment = segments[rang];
    if (segment.horsChaine) continue;
    if (versUnCommit && segment.lien === "&&") marques.add(segment);
    else versUnCommit = false;
    if (lireGit(lireCommande(segment.mots))?.verbe === "commit") versUnCommit = true;
  }
  return marques;
};

const suiteEntiere = (segment, commande, { profil, avantUnCommit }) =>
  estUneSuite(commande, profil.scriptsCibles) && !avantUnCommit.has(segment)
    ? `suite complète hors commit : pendant le travail, on ne joue que ce qu'on a touché — ${profil.cible}. ` +
      "Avant chaque commit, la suite complète se joue enchaînée à lui, qui ne part que si elle est verte : " +
      '`LOG=<scratchpad>/suite.log; <suite> > "$LOG" 2>&1 && git commit -F <msg> -- <chemins>; echo "EXIT=$?"`.'
    : null;

const binaireEtranger = (_segment, commande, { profil }) => {
  const refus =
    `le typecheck passe par les scripts du dépôt, avec le tsc et le tsconfig du paquet : ${profil.typecheck}. ` +
    "Un `npx` peut télécharger un autre binaire que celui du dépôt ; un outil du dépôt se lance par `pnpm exec <outil>`.";
  if (["npx", "pnpx"].includes(commande.nom)) return refus;
  const { outil, args } = outilEffectif(commande);
  return outil === "tsc" && !args.some((arg) => ["-p", "--project", "-b", "--build"].includes(arg) || arg.startsWith("--project=")) ? refus : null;
};

const mutation = (_segment, commande, { profil, humain }) => {
  if (!profil.strykerEnPause || commande.affectations.includes("STRYKER_DEMANDE")) return null;
  const lance =
    lirePnpm(commande)?.script === "test:mutation" ||
    outilEffectif(commande).outil === "stryker" ||
    (commande.nom === "node" && commande.valeurs.some((valeur) => valeur.endsWith("stryker-serial.mjs")));
  return lance
    ? `Stryker est en pause dans ce dépôt, et « fais tout » ne le couvre pas. Il ne part que si ${humain} le demande nommément dans ce tour : alors préfixe \`STRYKER_DEMANDE=1\`.`
    : null;
};

const EN_PERL = (masque) => {
  if (masque === "--extended-regexp") return "--perl-regexp";
  return /^-[a-zA-Z]+$/.test(masque) && masque.includes("E") ? masque.replace("E", "P") : null;
};

const grepGitEtendu = (segment, commande) => {
  const git = lireGit(commande);
  return git?.verbe === "grep" && git.args.some((arg) => EN_PERL(arg) !== null) && /\\[<>]/.test(segment.texte)
    ? "`git grep -E` ignore `\\<` et `\\>` et rend zéro ligne en silence : `git grep -w <mot>`, ou `-P` avec `\\b`."
    : null;
};

const poseLePipefail = (segment) => {
  const { nom, valeurs } = lireCommande(segment.mots);
  return nom === "set" && valeurs.some((valeur, rang) => valeur === "pipefail" && /^-[a-z]*o$/.test(valeurs[rang - 1] ?? ""));
};

const segmentsAuCodeGarde = (segments) => new Set(segments.filter((_segment, rang) => segments.slice(0, rang).some(poseLePipefail)));

const verdictDerriereUnPipe = (segment, commande, { codeGarde }) =>
  segment.lien === "|" && !codeGarde.has(segment) && estUnVerdict(commande)
    ? 'un verdict ne se lit jamais derrière un pipe, le `$?` serait celui du dernier maillon (un push lu « 0 » sur un échec) : `<commande> > "$LOG" 2>&1; echo "EXIT=$?"`, puis `grep` sur le journal, ou `set -o pipefail; <commande> | tail; echo "EXIT=$?"`.'
    : null;

const verdictParXargs = (_segment, commande) =>
  commande.nom === "xargs" && commande.valeurs.some((valeur) => OUTILS_A_VERDICT.has(valeur.split("/").pop()) || valeur === "pnpm")
    ? 'xargs joue l\'outil sans fichier sur une entrée vide, donc tout le paquet, et écrase son code : passe la liste en arguments, `$F` ou un tableau `"${F[@]}"`.'
    : null;

const VARIABLES_DE_SAUT = /^(HUSKY|LEFTHOOK|LEFTHOOK_SKIP|LEFTHOOK_EXCLUDE|SKIP_PRE\w*|GIT_CONFIG\w*)$/;
const EXPORTEURS = new Set(["export", "declare", "typeset"]);
const GESTES_DE_SECTION = new Set(["--remove-section", "--rename-section", "remove-section", "rename-section"]);

const nomsAffectes = (commande) => [
  ...commande.affectations,
  ...(EXPORTEURS.has(commande.nom) ? commande.valeurs.filter((valeur) => !valeur.startsWith("-")).map((valeur) => valeur.split("=")[0]) : []),
];

const VARIABLES_DU_DEPOT = /^GIT_(DIR|WORK_TREE)$/;

const reunir = (...lieux) => {
  const [ici, ...autres] = new Set(lieux.flatMap((lieu) => [lieu.ici, ...lieu.autres]));
  return { ici, autres };
};

const LIENS_ALTERNATIFS = new Set(["||", ")"]);

const apresLeGroupe = (dehors, dedans, avant, lien) => {
  if (["|", "&"].includes(lien)) return dehors;
  if (LIENS_ALTERNATIFS.has(avant)) return reunir(dedans, dehors);
  return avant === "|" && dedans.ici !== dehors.ici ? { ici: null, autres: [] } : dedans;
};

const OUVRANTS = new Set(["{", "if", "while", "until", "for"]);

const FERMANTS = new Set(["}", "fi", "done"]);

const ALTERNANCES = new Set(["else", "elif"]);

const enteteDe = (entree) => {
  const mots = sansDeclaration(entree);
  const tete = mots.findIndex(({ valeur }) => !PRECOMMANDES.has(valeur));
  return mots.slice(0, tete === -1 ? mots.length : tete + 1).map(({ valeur }) => valeur);
};

const ouvertures = (mots) => enteteDe(mots).filter((mot) => OUVRANTS.has(mot));

const fermeUnGroupe = (mots) => FERMANTS.has(lireCommande(mots).tete?.masque) || mots.at(-1)?.masque === "}";

const fonctionDeclaree = ({ mots, lien }) => (declareUneFonction(mots) ? mots[1]?.valeur : lien === "(" && mots.length === 1 ? mots[0].valeur : undefined);

const corpsDe = (segments, rang) => {
  const { mots, lien, profondeur } = segments[rang];
  let debut = rang;
  while (segments[debut - 1]?.horsChaine) debut -= 1;
  let ouverts = 0;
  for (let fin = lien === "(" || sansDeclaration(mots).length === 0 ? rang + 1 : rang; fin < segments.length; fin += 1) {
    ouverts += ouvertures(segments[fin].mots).length - (fermeUnGroupe(segments[fin].mots) ? 1 : 0);
    const suivant = segments.slice(fin + 1).find((segment) => !segment.horsChaine);
    if (ouverts <= 0 && !(suivant?.profondeur > profondeur)) return segments.slice(debut, fin + 1);
  }
  return segments.slice(debut);
};

const avecLesAppels = (segments) => {
  const fonctions = new Map();
  for (const [rang, segment] of segments.entries()) {
    const nom = fonctionDeclaree(segment);
    if (nom !== undefined) fonctions.set(nom, [...(fonctions.get(nom) ?? []), { profondeur: segment.profondeur, corps: corpsDe(segments, rang) }]);
  }
  const deplier = (liste, appeles) =>
    liste.flatMap((appel) => {
      const { nom } = lireCommande(appel.mots);
      if (nom === fonctionDeclaree(appel) || !fonctions.has(nom) || appeles.includes(nom)) return [appel];
      const copies = fonctions.get(nom).flatMap(({ profondeur, corps }) =>
        deplier(
          corps.map((segment) => ({ ...segment, profondeur: appel.profondeur + segment.profondeur - profondeur })),
          [...appeles, nom],
        ),
      );
      return [...copies.map((copie) => ({ ...copie, horsChaine: true })), appel];
    });
  return deplier(segments, []);
};

const dossiersDesSegments = (segments, cwd) => {
  const pile = [{ ici: cwd, autres: [], gitDir: false }];
  const groupes = [];
  let corpsAttendu = false;
  return segments.map(({ mots, avant: lu, lien, profondeur }) => {
    pile.length = Math.min(pile.length, profondeur + 1);
    while (pile.length <= profondeur) pile.push(pile.at(-1));
    while ((groupes.at(-1)?.profondeur ?? -1) > profondeur) groupes.pop();
    const avant = corpsAttendu || declareUneFonction(mots) ? ")" : lu;
    corpsAttendu = declareUneFonction(mots) && mots.length <= 2;
    const entete = enteteDe(mots);
    const si = groupes.at(-1);
    if (si?.issues !== undefined && entete.includes("then")) si.depart = reunir(si.depart, pile.at(-1));
    if (si?.issues !== undefined && entete.some((mot) => ALTERNANCES.has(mot))) {
      si.issues.push(pile.at(-1));
      pile[pile.length - 1] = { ...pile.at(-1), ici: si.depart.ici, autres: si.depart.autres };
    }
    const etat = pile.at(-1);
    for (const ouvrant of ouvertures(mots))
      groupes.push({ avant, dehors: etat, profondeur, ...(ouvrant === "if" ? { issues: [], depart: etat } : {}) });
    const lue = lireCommande(mots);
    const nomme = nomsAffectes(lue).some((nom) => VARIABLES_DU_DEPOT.test(nom));
    const vers = (ici) => {
      const cible = cibleDuCd(lue.valeurs, ici);
      return cible !== null && estUnDossier(cible) ? cible : null;
    };
    const { ici, autres } = lue.nom === "cd" ? apresLeGroupe(etat, reunir({ ici: vers(etat.ici), autres: etat.autres.map(vers) }), avant, lien) : etat;
    pile[pile.length - 1] = { ici, autres, gitDir: etat.gitDir || (nomme && (EXPORTEURS.has(lue.nom) || lue.nom === "")) };
    const groupe = fermeUnGroupe(mots) ? groupes.pop() : undefined;
    if (groupe !== undefined) {
      const sortie = apresLeGroupe(groupe.dehors, reunir(...(groupe.issues ?? []), pile.at(-1)), groupe.avant, lien);
      pile[pile.length - 1] = { ...pile.at(-1), ici: sortie.ici, autres: sortie.autres };
    }
    return { ici: etat.ici, autres: etat.autres, gitDir: etat.gitDir || nomme };
  });
};

const dossierDuGit = ({ options, chemins }, { ici, gitDir }) =>
  gitDir || options.some((option) => /^--(git-dir|work-tree)\b/.test(option)) ? null : chemins.reduce(deplacer, ici);

const VERBES_DU_DEPOT = new Set(["add", "rm", "mv", "restore", "commit"]);

const depotIllisible = (_segment, commande, { illisible }) =>
  illisible && VERBES_DU_DEPOT.has(lireGit(commande)?.verbe)
    ? "le dossier où ce git s'exécute ne se lit pas avant exécution (`cd` vers une cible absente, à variable, à option ou sans argument, `-C` à variable, `--git-dir`, `--work-tree`, `GIT_DIR`, `GIT_WORK_TREE`) : " +
      "la garde ne sait pas quel dépôt il touche. `cd <dossier existant> && git …` ou `git -C <dossier littéral> …`."
    : null;

const contexteDuSegment = (lue, etat, contexte, depotDuDossier) => {
  const git = lireGit(lue);
  if (git === null) return contexte;
  const dossier = dossierDuGit(git, etat);
  if (dossier === null) return { ...contexte, illisible: true };
  return dossier === contexte.cwd ? contexte : { ...contexte, ...depotDuDossier(dossier), cwd: dossier };
};

const reecritLaSectionCore = ({ verbe, args }) =>
  verbe === "config" && args.some((arg) => GESTES_DE_SECTION.has(arg)) && args.some((arg) => /^core$/i.test(arg));

const CLE_DES_HOOKS = /core\.hookspath/i;
const LECTURE_DE_CONFIG = new Set(["--get", "--get-all", "--local", "--global", "--system", "--worktree", "--show-origin", "--show-scope"]);

const litLesHooks = ({ verbe, args }) => {
  const options = (args[0] === "get" ? args.slice(1) : args).slice(0, -1);
  return verbe === "config" && /^core\.hookspath$/i.test(args.at(-1) ?? "") && options.every((arg) => LECTURE_DE_CONFIG.has(arg));
};

const estUnMessage = (args, rang) => ["-m", "--message"].includes(args[rang - 1]) || args[rang].startsWith("--message=");

const ecritLaCleDesHooks = (git) =>
  git.options.some((option) => CLE_DES_HOOKS.test(option)) ||
  (!GIT_EN_LECTURE.has(git.verbe) &&
    !litLesHooks(git) &&
    git.args.some((arg, rang) => CLE_DES_HOOKS.test(arg) && !(git.verbe === "commit" && estUnMessage(git.args, rang))));

const contournementDesHooks = (_segment, commande, { segments }) => {
  const git = lireGit(commande);
  const avecGit = segments.some((segment) => lireGit(lireCommande(segment.mots)) !== null);
  const sautDeHook =
    nomsAffectes(commande).some((nom) => VARIABLES_DE_SAUT.test(nom) || (nom === "SKIP" && avecGit)) ||
    (git !== null && (ecritLaCleDesHooks(git) || reecritLaSectionCore(git))) ||
    (git !== null && !GIT_EN_LECTURE.has(git.verbe) && git.args.includes("--no-verify")) ||
    (git?.verbe === "commit" && git.args.some((arg) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(arg)));
  return sautDeHook
    ? "les hooks du dépôt ne se contournent jamais (`--no-verify`, `-n`, `HUSKY`, `LEFTHOOK*`, `SKIP_PRE_*`, `SKIP`, `GIT_CONFIG_*`, l'écriture de `core.hooksPath`, la section `core` retirée ou renommée) : " +
        "un rouge du pre-commit ou du pre-push se corrige. La lecture passe : `git config --get core.hooksPath`."
    : null;
};

const VERBES_GIT_QUI_ECRIVENT = new Set(["add", "commit", "mv", "rm", "push", "restore"]);
const ERREUR_JETEE = [/(^|\s)(2|&)>\s*\/dev\/null/, /(^|\s)>\s*\/dev\/null.*\s2>&1/];

const ecritureGitMuette = (segment, commande) =>
  VERBES_GIT_QUI_ECRIVENT.has(lireGit(commande)?.verbe) && ERREUR_JETEE.some((motif) => motif.test(segment.texte))
    ? "l'erreur d'une écriture git ne part jamais dans /dev/null : un `git add` muet sur un chemin déjà renommé a laissé partir un commit sans ses fichiers. La sortie va au journal, `> \"$LOG\" 2>&1; echo \"EXIT=$?\"`."
    : null;

const tuerieParMotif = (_segment, commande) =>
  ["pkill", "killall"].includes(commande.nom) || (commande.nom === "xargs" && commande.valeurs[0] === "kill")
    ? "un processus ne se tue que par son pid, relevé dans le dépôt (`pgrep -fl`, puis `kill <pid>`) : un `pkill -f \"git push\"` a tué la poussée d'un autre projet de la machine."
    : null;

const AJOUTS_EN_MASSE = new Set(["-A", "--all", ".", "-u", "--update", "-N", "--intent-to-add", "-p", "--patch", "-i", "--interactive", ":/", "--no-ignore-removal"]);

const estUnDossier = (chemin) => {
  try {
    return statSync(chemin).isDirectory();
  } catch {
    return false;
  }
};

const fusionEnCours = (dossier) => spawnSync("git", ["-C", dossier, "rev-parse", "-q", "--verify", "MERGE_HEAD"], { stdio: "ignore" }).status === 0;

const fichierDePathspecs = (args) => {
  const rang = args.findIndex((arg) => arg === "--pathspec-from-file" || arg.startsWith("--pathspec-from-file="));
  return rang === -1 ? undefined : args[rang].includes("=") ? args[rang].slice(args[rang].indexOf("=") + 1) : (args[rang + 1] ?? "");
};

const listeDe = (base, fichier, nul) => {
  try {
    return readFileSync(resolve(base, fichier), "utf8")
      .split(nul ? "\0" : /\r?\n/)
      .filter((chemin) => chemin !== "");
  } catch {
    return null;
  }
};

const sansChemin = (args, base) => {
  const fichier = fichierDePathspecs(args);
  if (fichier === undefined) return !args.includes("--") || args.at(-1) === "--";
  return fichier === "-" || listeDe(base, fichier, args.includes("--pathspec-file-nul"))?.length === 0;
};

const OPTIONS_DE_RESTAURATION = { source: { type: "string", short: "s" }, staged: { type: "boolean", short: "S" }, worktree: { type: "boolean", short: "W" } };

const restaurationLue = (args) => {
  try {
    return parseArgs({ args, options: OPTIONS_DE_RESTAURATION, allowPositionals: true });
  } catch {
    return null;
  }
};

const absentDe = (racine, nom) => {
  const parties = nom.split("/");
  for (const rang of parties.keys()) {
    const etat = lstatSync(join(racine, ...parties.slice(0, rang + 1)), { throwIfNoEntry: false });
    if (etat?.isDirectory() !== true) return etat === undefined;
  }
  return false;
};

const restaurable = (base, chemin) => {
  if (/[*?[]/.test(chemin)) return false;
  const racine = resolve(base, sortieDeGit(base, ["rev-parse", "--show-cdup"]).stdout.trim());
  const nom = relative(racine, resolve(base, chemin));
  const [arbre = ""] = cheminsDe(sortieDeGit(base, ["ls-tree", "-z", "--full-name", "HEAD", "--", chemin]).stdout);
  const [, mode, objet] = /^(\d+) blob (\w+)\t/.exec(arbre) ?? [];
  return (
    arbre === `${mode} blob ${objet}\t${nom}` &&
    cheminsDe(sortieDeGit(base, ["ls-files", "-z", "-s", "--full-name", "--", chemin]).stdout).every((entree) => entree === `${mode} ${objet} 0\t${nom}`) &&
    absentDe(racine, nom)
  );
};

const restaureDesAbsents = (args, base) => {
  const lue = restaurationLue(args);
  return lue !== null && [undefined, "HEAD"].includes(lue.values.source) && lue.positionals.length > 0 && lue.positionals.every((chemin) => restaurable(base, chemin));
};

const GESTES_GIT_REFUSES = {
  stash: (args) => !["list", "show"].includes(args[0]),
  clean: () => true,
  rm: (args, _base, partage) => partage || args.some((arg) => arg === "--cached" || arg === "." || /[*?]/.test(arg)),
  add: (args, base) => args.some((arg) => AJOUTS_EN_MASSE.has(arg) || /[*?]/.test(arg) || estUnDossier(resolve(base, arg))),
  commit: (args, base) => args.some((arg) => arg === "--all" || /^-[a-zA-Z]*a/.test(arg)) || (sansChemin(args, base) && !fusionEnCours(base)),
  restore: (args, base, partage) =>
    !args.some((arg) => ["--staged", "-S"].includes(arg)) || (args.some((arg) => ["--worktree", "-W"].includes(arg)) && (partage || !restaureDesAbsents(args, base))),
  checkout: (args) => args.includes("--") || args.includes("."),
  reset: (args) => args.some((arg) => ["--hard", "--keep", "--merge"].includes(arg)),
};

const gesteGit = (_segment, commande, { cwd, profil }) => {
  const git = lireGit(commande);
  const partage = profil.arbrePartage === true;
  const refuse = git && Object.hasOwn(GESTES_GIT_REFUSES, git.verbe) ? GESTES_GIT_REFUSES[git.verbe] : null;
  if (!refuse?.(git.args, cwd, partage)) return null;
  return (
    `\`git ${git.verbe}\` sous cette forme jette du travail non commité ou embarque des fichiers non relus` +
    (partage ? ", ceux des sessions voisines compris (arbre partagé). " : ". ") +
    "On nomme les fichiers : `git add <fichiers neufs>`, puis `git commit -F <msg> -- <chemins>` ; " +
    (partage ? "un fichier se supprime par `rm`, puis entre au commit par son chemin" : "un fichier suivi se supprime par `git rm <fichier>`") +
    " ; `git restore --staged <f>` seul retire de l'index" +
    (partage ? "." : " ; un fichier suivi absent de l'arbre se rend, fichier par fichier, par `git restore --source=HEAD --staged --worktree -- <f>`.")
  );
};

const sortieDeGit = (dossier, args) => spawnSync("git", ["-C", dossier, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });

const cheminsDe = (sortie) => sortie.split("\0").filter((chemin) => chemin !== "");

const lignesDe = (sortie, prefixe) =>
  sortie
    .split("\n")
    .filter((ligne) => ligne !== "")
    .map((ligne) => {
      const [chemin, numero, ...texte] = ligne.split("\0");
      return { citant: chemin.slice(prefixe.length), ligne: Number(numero), texte: texte.join("\0") };
    });

const citation = (chemin, fin = "") =>
  new RegExp(`(?:^|[^\\w.\\-/~@+])(?:\\./|/|@)?${chemin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${fin}(?![/.]?[\\w-])`);

const parentsDe = (chemin) =>
  chemin
    .split("/")
    .slice(0, -1)
    .map((_, rang, morceaux) => morceaux.slice(0, rang + 1).join("/"));

const retiresDuCommit = (cwd, fichiers) => {
  const suivis = [
    ...cheminsDe(sortieDeGit(cwd, ["ls-files", "-z", "--full-name", "--", ":/"]).stdout),
    ...cheminsDe(sortieDeGit(cwd, ["ls-tree", "-r", "-z", "--name-only", "--full-tree", "HEAD"]).stdout),
  ];
  const habites = new Set(suivis.filter((chemin) => !fichiers.has(chemin)).flatMap(parentsDe));
  return [
    ...[...fichiers].map((chemin) => ({ chemin, cherche: chemin, motif: citation(chemin) })),
    ...[...new Set([...fichiers].flatMap(parentsDe))]
      .filter((dossier) => !habites.has(dossier))
      .map((dossier) => ({ chemin: `${dossier}/`, cherche: dossier, motif: citation(dossier, dossier.includes("/") ? "/?" : "/") })),
  ];
};

const citesSurLaLigne = (retires, texte) => {
  const cites = retires.filter(({ motif }) => motif.test(texte));
  return cites.filter(({ chemin }) => !chemin.endsWith("/") || !cites.some((autre) => autre.chemin !== chemin && autre.chemin.startsWith(chemin)));
};

const CITATIONS_MONTREES = 20;

const citantsLus = (segment, commande) =>
  commande.affectations.includes("CITANTS_LUS") ? segment.mots.find(({ valeur }) => valeur.startsWith("CITANTS_LUS="))?.valeur.slice("CITANTS_LUS=".length) : null;

const GESTES_ILLISIBLES = new Set(["mv", "unlink", "rmdir", "trash", "xargs"]);

const OPTIONS_QUI_RETIRENT = new Set(["-delete", "-exec", "-execdir", "-ok"]);

const cheminsDuGeste = (valeurs) => {
  const borne = valeurs.indexOf("--");
  return [...(borne === -1 ? valeurs : valeurs.slice(0, borne)).filter((valeur) => !valeur.startsWith("-")), ...(borne === -1 ? [] : valeurs.slice(borne + 1))];
};

const retraitsEnchaines = (segments, dossiers, jusqua, cwd, inclut) => {
  const retraits = { arbre: [], index: [], ajouts: [] };
  for (const [rang, segment] of segments.slice(0, jusqua).entries()) {
    const lue = lireCommande(segment.mots);
    const nom = basename(lue.nom);
    const git = lireGit(lue);
    const geste = git === null ? (nom === "rm" ? "arbre" : null) : git.verbe === "rm" ? "index" : inclut && git.verbe === "add" ? "ajouts" : null;
    const ici = git === null ? dossiers[rang].ici : dossierDuGit(git, dossiers[rang]);
    const absolus = geste === null ? [] : cheminsDuGeste(git?.args ?? lue.valeurs).map((chemin) => (/[*?[{]|^:/.test(chemin) ? null : deplacer(ici, chemin)));
    if (GESTES_ILLISIBLES.has(nom) || git?.verbe === "mv" || (nom === "find" && lue.valeurs.some((valeur) => OPTIONS_QUI_RETIRENT.has(valeur))) || absolus.includes(null))
      return { illisible: segment.texte.trim() };
    if (geste !== null) retraits[geste].push(...absolus.map((absolu) => relative(cwd, absolu) || "."));
  }
  return retraits;
};

const ecritAvant = (segments, dossiers, jusqua, cible) =>
  cible !== null &&
  segments.slice(0, jusqua).some((segment, rang) => segment.mots.some(({ valeur }) => deplacer(dossiers[rang].ici, valeur.replace(/^(\d*|&)?>>?\|?/, "")) === cible));

const citationsDuRetrait = (segment, commande, { cwd, profil, segments, dossiers }) => {
  const git = lireGit(commande);
  if (git?.verbe !== "commit") return null;
  const rang = segments.indexOf(segment);
  const fichier = fichierDePathspecs(git.args);
  if (fichier !== undefined && (/[$`]/.test(fichier) || ecritAvant(segments, dossiers, rang, deplacer(cwd, fichier))))
    return `ce commit lit ses chemins dans \`${fichier}\`, qu'un geste de la même commande écrit ou dont le nom ne se lit pas avant exécution : écris la liste seule, puis le commit.`;
  const borne = git.args.indexOf("--");
  const chemins = fichier !== undefined ? (listeDe(cwd, fichier, git.args.includes("--pathspec-file-nul")) ?? []) : borne === -1 ? [] : git.args.slice(borne + 1);
  const fusion = chemins.length === 0 && fusionEnCours(cwd);
  if (chemins.length === 0 && !fusion) return null;
  const inclut = fusion || (borne === -1 ? git.args : git.args.slice(0, borne)).some((arg) => arg === "--include" || /^-[a-zA-Z]*i/.test(arg));
  const supprimes = (...args) => sortieDeGit(cwd, ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=D", ...args]);
  const illisible = chemins.find((chemin) => /[$`]/.test(chemin));
  if (illisible !== undefined)
    return supprimes("HEAD").stdout === ""
      ? null
      : `un chemin de ce commit ne se lit pas avant exécution (\`${illisible}\`) et l'arbre porte une suppression face à HEAD : nomme les chemins en littéral, ou passe-les par \`--pathspec-from-file=<fichier>\`.`;
  const duTravail = fusion ? supprimes("--cached", "HEAD") : supprimes("HEAD", "--", ...chemins);
  if (duTravail.status !== 0) return null;
  const enchaines = retraitsEnchaines(segments, dossiers, rang, cwd, inclut);
  if (enchaines.illisible !== undefined)
    return `ce commit suit un geste qui retire ou déplace des chemins que la garde ne lit pas avant exécution (\`${enchaines.illisible}\`) : lance ce geste seul, puis le commit.`;
  const suivis = (liste, ...options) => liste.flatMap((chemin) => cheminsDe(sortieDeGit(cwd, ["ls-files", "-z", "--full-name", ...options, "--", chemin]).stdout));
  const duCommit = new Set(suivis(chemins));
  const arbre = suivis(enchaines.arbre);
  const index = suivis(enchaines.index);
  const fichiers = new Set([
    ...cheminsDe(duTravail.stdout),
    ...[...arbre, ...index].filter((chemin) => duCommit.has(chemin)),
    ...(inclut
      ? [...cheminsDe(supprimes("--cached", "HEAD").stdout), ...index, ...suivis(enchaines.ajouts, "--deleted"), ...suivis(enchaines.ajouts).filter((chemin) => arbre.includes(chemin))]
      : []),
  ]);
  if (fichiers.size === 0) return null;
  const retires = retiresDuCommit(cwd, fichiers);
  const chercher = (...args) => sortieDeGit(cwd, ["grep", "-n", "-z", "--full-name", "-I", "-F", ...retires.flatMap(({ cherche }) => ["-e", cherche]), ...args]).stdout;
  const citations = [
    ...(fusion ? [] : lignesDe(chercher("--", ...chemins), "")),
    ...lignesDe(chercher(inclut ? "--cached" : "HEAD", "--", ":/"), inclut ? "" : "HEAD:").filter(({ citant }) => !duCommit.has(citant)),
  ]
    .filter(({ citant, texte }) => !fichiers.has(citant) && !/ignore$/.test(basename(citant)) && !/\bgit (log|show)\b/.test(texte))
    .flatMap(({ citant, ligne, texte }) => citesSurLaLigne(retires, texte).map(({ chemin }) => ({ citant, ligne, retire: chemin })))
    .sort((a, b) => a.citant.localeCompare(b.citant) || a.ligne - b.ligne || a.retire.localeCompare(b.retire));
  const n = citations.length;
  if (n === 0 || citantsLus(segment, commande) === String(n)) return null;
  return (
    `ce commit retire des chemins que des fichiers suivis citent encore (${n} citation${n > 1 ? "s" : ""}) :\n` +
    citations
      .slice(0, CITATIONS_MONTREES)
      .map(({ citant, ligne, retire }) => `${citant}:${ligne} → ${retire}\n`)
      .join("") +
    (n > CITATIONS_MONTREES ? `… et ${n - CITATIONS_MONTREES} autres\n` : "") +
    `réécris ou retire ces citations, ou relance avec \`CITANTS_LUS=${n}\` en préfixe du commit` +
    (profil.arbrePartage === true ? "." : " ; ou rends le fichier par `git restore --source=HEAD --staged --worktree -- <f>`.")
  );
};

const worktreeSansDemande = (_segment, commande, { humain }) => {
  const git = lireGit(commande);
  return git?.verbe === "worktree" && git.args[0] === "add" && !commande.affectations.includes("WORKTREE_DEMANDE")
    ? `aucun worktree sans demande : on travaille dans cet arbre, et un commit y nomme ses chemins. Si ${humain} le demande nommément dans ce tour, préfixe \`WORKTREE_DEMANDE=1\`.`
    : null;
};

const DEMANDE_DE_MERGE = /(?<![\p{L}])(?:merg|fusionn)/iu;
const DEMANDE_DE_PUSH = /(?<![\p{L}])(?:push|pouss|publi|PR(?![\p{L}]))/iu;
const rapportSansPush = (humain) =>
  `le rapport donne l'état local (SHA et avance sur l'amont \`git rev-list --count @{u}..HEAD\` s'il y a eu commit), et ${humain} valide`;
const sansSaDemande = (humain) => `le dernier message ${de(humain)} ne le demande pas : ${rapportSansPush(humain)}.`;

const NIE = (racines) =>
  new RegExp(
    `(?<![\\p{L}])(?:n['’]?e?\\s+(?:\\S+\\s+){0,2}(?:${racines})\\p{L}*\\s+(?:pas|jamais|plus)|(?:pas|sans|jamais|inutile)(?:\\s+besoin)?\\s+(?:de\\s+|d['’])?(?:${racines}))`,
    "iu",
  );
const PUSH_NIE = NIE("push|pouss|publi");
const MERGE_NIE = NIE("merg|fusionn");

const valideParLHumain = (prefixe, motif, nie) => (commande, { demande }) => {
  if (!commande.affectations.includes(prefixe)) return false;
  return demande === undefined || (motif.test(demande) && !nie.test(demande));
};

const fusion = (_segment, commande, contexte) => {
  if (commande.nom !== "gh" || commande.valeurs[0] !== "pr" || commande.valeurs[1] !== "merge") return null;
  if (commande.valeurs.includes("--admin")) return "`--admin` jamais : il contourne le ruleset de la branche protégée. Le merge passe par les contrôles requis.";
  if (valideParLHumain("MERGE_DEMANDE", DEMANDE_DE_MERGE, MERGE_NIE)(commande, contexte)) return null;
  const { humain } = contexte;
  return commande.affectations.includes("MERGE_DEMANDE")
    ? `merge refusé, ${sansSaDemande(humain)}`
    : `un merge ne part que sur demande explicite ${de(humain)}, dans son dernier message : alors préfixe \`MERGE_DEMANDE=1\`, jamais \`--admin\`. Sinon ${rapportSansPush(humain)}.`;
};

const poussee = (_segment, commande, contexte) => {
  const pousse = lireGit(commande)?.verbe === "push";
  const ouvreUnePr = commande.nom === "gh" && commande.valeurs[0] === "pr" && commande.valeurs[1] === "create";
  if (!pousse && !ouvreUnePr) return null;
  if (valideParLHumain("PUSH_DEMANDE", DEMANDE_DE_PUSH, PUSH_NIE)(commande, contexte)) return null;
  const { humain } = contexte;
  return commande.affectations.includes("PUSH_DEMANDE")
    ? `push refusé, ${sansSaDemande(humain)}`
    : `${humain} pousse ou valide : un push ou une PR ne part que si son dernier message le demande, alors préfixe \`PUSH_DEMANDE=1\`. Sinon ${rapportSansPush(humain)}.`;
};

const DOCKER_A_VALEUR = new Set(["-t", "--time", "-s", "--signal"]);
const DOCKER_RUN_A_VALEUR = new Set([
  "-e", "--env", "--env-file", "-v", "--volume", "-p", "--publish", "--name", "--network", "--net", "-w", "--workdir",
  "--entrypoint", "-u", "--user", "--add-host", "--mount", "-l", "--label", "--platform", "--pull", "--cpus", "-m",
  "--memory", "-h", "--hostname", "--dns", "--restart", "--tmpfs", "--ulimit", "--cap-add", "--cap-drop", "--security-opt",
]);
const COMPOSE_A_VALEUR = new Set(["-p", "--project-name", "-f", "--file", "--env-file", "--profile", "--project-directory", "--ansi", "--progress", "--parallel"]);
const OBJETS_DOCKER = new Set(["container", "image", "volume", "system", "builder", "network"]);
const VERBES_QUI_CIBLENT = new Set(["stop", "kill", "rm", "restart", "pause"]);

const lireDocker = (commande) => {
  if (commande.nom !== "docker") return null;
  const [premier = "", ...reste] = commande.valeurs;
  if (OBJETS_DOCKER.has(premier)) return { objet: premier, verbe: reste[0] ?? "", args: reste.slice(1) };
  if (premier === "rmi") return { objet: "image", verbe: "rm", args: reste };
  return { objet: "container", verbe: premier, args: reste };
};

const lireCompose = (commande) => {
  const valeurs =
    commande.nom === "docker-compose" ? commande.valeurs : commande.nom === "docker" && commande.valeurs[0] === "compose" ? commande.valeurs.slice(1) : null;
  if (valeurs === null) return null;
  let rang = 0;
  while (rang < valeurs.length && valeurs[rang].startsWith("-")) rang += COMPOSE_A_VALEUR.has(valeurs[rang]) ? 2 : 1;
  return { verbe: valeurs[rang] ?? "", args: valeurs.slice(rang + 1) };
};

const vmPartagee = (prefixe) =>
  "la VM Docker est partagée entre les projets de la machine : aucun volume ne se supprime ni ne se purge à la main (`volume rm`, `volume prune`, `system prune`, `compose down -v`), " +
  (prefixe ? `et l'on ne touche que les conteneurs et images \`${prefixe}*\`, nommés. ` : "") +
  "Pour la place : `docker builder prune -f`, puis `docker image prune -f` sans `-a`.";

const docker = (_segment, commande, { profil, imagesDeLaCi }) => {
  const prefixe = profil.docker?.prefixe;
  const compose = lireCompose(commande);
  if (compose?.verbe === "down" && compose.args.some((arg) => ["-v", "--volumes"].includes(arg))) return vmPartagee(prefixe);
  const lue = lireDocker(commande);
  if (lue === null) return null;
  const { objet, verbe, args } = lue;
  if (objet === "volume" && ["rm", "prune"].includes(verbe)) return vmPartagee(prefixe);
  if (verbe === "prune" && (["system", "container"].includes(objet) || args.some((arg) => ["-a", "--all"].includes(arg)))) return vmPartagee(prefixe);
  if (prefixe === undefined) return null;
  const duDepot = (nom) => nom.toLowerCase().includes(prefixe);
  if (["container", "image"].includes(objet) && VERBES_QUI_CIBLENT.has(verbe) && positionnels(args, DOCKER_A_VALEUR).some((cible) => !duDepot(cible)))
    return vmPartagee(prefixe);
  if (objet !== "container" || verbe !== "run") return null;
  const [image = ""] = positionnels(args, DOCKER_RUN_A_VALEUR);
  return duDepot(image) || imagesDeLaCi().includes(image)
    ? null
    : `tout passe par les compose du dépôt (${profil.docker.compose}) : une image tierce lancée à la main a déjà visé le vrai site, et un Postgres hors compose a déjà faussé un chantier.`;
};

const LECTEURS = new Set(["cat", "head", "tail", "less", "more", "bat", "nl", "strings", "xxd", "od", "base64", "hexdump", "tac"]);
const FICHIER_SECRET = /(^|\/)(\.env(\.[\w.-]+)?|secrets\/[^/]+)$/;
const CONFIG_SANS_VALEURS = new Set(["-q", "--quiet", "--services", "--volumes", "--profiles", "--images", "--networks", "--hash"]);
const SORTIE_REDIRIGEE = /(^|[\s1])>(?!&)/;

const secretAffiche = (segment, commande) => {
  if (LECTEURS.has(commande.nom) && commande.valeurs.some((valeur) => FICHIER_SECRET.test(valeur) && !valeur.endsWith(".example")))
    return "jamais de secret dans la sortie (un jeton a déjà fini imprimé) : lis une clé nommée non secrète (`grep -E '^MAILPIT_WEB_PORT=' .env.dev`) ou les noms seuls (`cut -d= -f1 .env.dev`).";
  const compose = lireCompose(commande);
  return compose?.verbe === "config" && !compose.args.some((arg) => CONFIG_SANS_VALEURS.has(arg)) && !SORTIE_REDIRIGEE.test(masquer(segment.texte))
    ? "jamais de secret dans la sortie : `docker compose config` imprime les valeurs interpolées. Les noms seuls passent par `config --services` ou `config -q` ; le rendu complet va dans un fichier du scratchpad, `config > <scratchpad>/compose.yml`, qui ne s'affiche pas."
    : null;
};

const environnementDeLaBase = (_segment, commande, { profil }) => {
  if (!profil.baseParSession) return null;
  if (["source", "."].includes(commande.nom) && /(^|\/)\.env/.test(commande.valeurs[0] ?? ""))
    return "ne jamais sourcer un `.env` : `apps/api/.env` force `NODE_ENV=development` et casse `next build`. Base par session : `eval \"$(bash scripts/test-space.sh env --id <id>)\"`.";
  return commande.nom === "" && commande.affectations.some((nom) => /^(POSTGRES_\w+|DATABASE_URL|NODE_ENV)$/.test(nom))
    ? "le shell n'exporte pas une affectation seule : la commande suivante vise la base par défaut. `export POSTGRES_DB=… POSTGRES_SHADOW_DB=…;`, ou l'affectation en préfixe de la commande."
    : null;
};

const migrationsHorsIndex = (_segment, commande, { profil, nonSuivies }) => {
  if (!profil.migrations?.scripts.includes(lirePnpm(commande)?.script)) return null;
  const horsIndex = nonSuivies();
  return horsIndex.length === 0
    ? null
    : `le tier compte les migrations par \`git ls-files\` sur la copie de l'index : ${horsIndex.join(", ")} non suivie(s) le ferai(en)t rougir pour une mauvaise raison. \`git add\` d'abord.`;
};

const OUTILS_DE_PASSAGE = new Set(["vitest", "jest", "playwright", "lhci", "stryker"]);
const PASSAGES = [/vitest(\.mjs)?\s+run\b/, /\/jest(-cli)?\/bin\/jest\.js|\.bin\/jest\b/, /playwright.*\stest\b/, /\blhci\s+autorun\b/, /\bstryker\b/];

const lanceDesTests = (commande) => {
  const pnpm = lirePnpm(commande);
  if (pnpm !== null && /^(test|e2e|docker:tier|lhci)/.test(pnpm.script)) return true;
  return OUTILS_DE_PASSAGE.has(outilEffectif(commande).outil) || lanceUnHookGit(commande) || lireGit(commande)?.verbe === "push";
};

const passageConcurrent = (_segment, commande, { profil, racine, processus }) => {
  if (!profil.passagesExclusifs || !lanceDesTests(commande)) return null;
  const enCours = processus().filter(
    (ligne) => (ligne.includes(racine) && PASSAGES.some((motif) => motif.test(ligne))) || ligne.includes(profil.passagesExclusifs),
  );
  if (enCours.length === 0) return null;
  const pids = enCours.map((ligne) => ligne.split(/\s+/)[0]).join(", ");
  return (
    `un autre passage de tests de ce dépôt tourne déjà (pid ${pids}) : deux passages se partagent coverage/.tmp, la base de test et la VM Docker, ` +
    "et l'un fausse l'autre (le pre-push d'un `git push` en est un). Attends sa notification de fin ; s'il est orphelin, lis-le par `ps -p <pid> -o command=` puis `kill <pid>`."
  );
};

const REGLES_DU_SEGMENT = [
  grepGitEtendu,
  verdictDerriereUnPipe,
  verdictParXargs,
  mutation,
  suiteEntiere,
  binaireEtranger,
  contournementDesHooks,
  ecritureGitMuette,
  tuerieParMotif,
  worktreeSansDemande,
  depotIllisible,
  gesteGit,
  citationsDuRetrait,
  fusion,
  poussee,
  docker,
  secretAffiche,
  environnementDeLaBase,
  migrationsHorsIndex,
  passageConcurrent,
];

const EDITION =
  "modification de fichier par le shell : on édite par Read, Edit et Write, parce qu'un remplacement qui ne trouve rien réussit en silence. " +
  "Une transformation en masse sur des dizaines de fichiers est un script écrit par Write, annoncé, qui compte ses remplacements.";

const editeSurPlace = ({ nom, valeurs }) =>
  (nom === "sed" && valeurs.some((valeur) => /^-[a-zA-Z]*i/.test(valeur) || valeur.startsWith("--in-place"))) ||
  (nom === "perl" && valeurs.some((valeur) => /^-[a-zA-Z]*i/.test(valeur))) ||
  (["awk", "gawk"].includes(nom) && valeurs.includes("inplace"));

const CORPS_DE_HEREDOC = /<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2(?=\n|$|\))/g;

const sansCorpsDeHeredoc = (commande) => commande.replace(CORPS_DE_HEREDOC, "<<$1$2$1$3");

const INTERPRETES = new Set(["python", "python3", "node", "bash", "sh", "zsh", "perl", "ruby", "deno", "bun", "tsx", "ts-node"]);

const redirectionDesPieces = (commande, { masque, corps }, ou) =>
  corps.reduce(
    (trouvee, { debut, fin }) => trouvee ?? redirectionDesPieces(commande.slice(debut, fin), lireLaCommande(commande.slice(debut, fin)), ou),
    redirectionHorsTemporaire(commande, masque, ou),
  );

const refusGlobal = (commande, lecture, segments, ou) => {
  if (lecture.ambigu !== null) return lecture.ambigu;
  const heredoc = segments.some((segment) => /(^|[^<])<<(?!<)/.test(masquer(segment.texte)));
  if (heredoc && segments.some((segment) => INTERPRETES.has(lireCommande(segment.mots).nom)))
    return `heredoc qui nourrit un interpréteur. ${EDITION}`;
  if (segments.some((segment) => editeSurPlace(lireCommande(segment.mots)))) return EDITION;
  if (ou.profil.baseParSession && /DATABASE_URL=["']?postgres(ql)?:\/\//.test(commande))
    return "jamais d'URL de base saisie : des composants `POSTGRES_*` explicites, ou la base de la session par `eval \"$(bash scripts/test-space.sh env --id <lot>)\"`.";
  const cible = redirectionDesPieces(commande, lecture, ou);
  return cible === null
    ? null
    : `redirection vers \`${cible}\`, hors du répertoire temporaire : une écriture passe par Write ; un journal va dans le scratchpad (\`LOG=<scratchpad>/x.log; … > "$LOG" 2>&1\`).`;
};

const longueParNature = (commande) => {
  const git = lireGit(commande);
  if (git !== null) return ["push", "commit"].includes(git.verbe);
  const [premier = "", second] = commande.valeurs;
  if (commande.nom === "node") return premier.includes("gitnexus") && second === "analyze";
  if (commande.nom === "bash") return premier.endsWith("e2e-navigateur.sh");
  return lirePnpm(commande)?.script === "e2e";
};

const arrierePlanInutile = (segments) =>
  segments.some((segment) => longueParNature(lireCommande(segment.mots)))
    ? null
    : "`run_in_background` ne sert qu'aux commandes qui dépassent le plafond de 600 s : `git push`, `git commit` (et la suite complète qui le précède), `gitnexus analyze`, la pile e2e navigateur. " +
      "Une commande ciblée tient au premier plan, et l'on n'attend jamais par `sleep`.";

const lireProcessus = () =>
  (spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" }).stdout ?? "")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "");

const lireNonSuivies = (racine, dossier) =>
  (spawnSync("git", ["-C", racine, "ls-files", "-o", "--exclude-standard", "--", dossier], { encoding: "utf8" }).stdout ?? "")
    .split("\n")
    .filter((ligne) => ligne !== "");

const lireImagesDeLaCi = (racine) => {
  try {
    return [...readFileSync(join(racine, ".github/workflows/ci.yml"), "utf8").matchAll(/^\s*container:\s*["']?([^\s"']+)/gm)].map((trouve) => trouve[1]);
  } catch {
    return [];
  }
};

export const refusDuShell = (
  brute,
  {
    racine,
    cwd = racine,
    profil = PROFIL_GENERIQUE,
    depotDe: depotDuDossier = depotDe,
    arrierePlan = false,
    processus = lireProcessus,
    nonSuivies = () => lireNonSuivies(racine, profil.migrations?.dossier),
    imagesDeLaCi = () => lireImagesDeLaCi(racine),
    demande,
    humain = HUMAIN_PAR_DEFAUT,
  },
) => {
  const commande = sansCorpsDeHeredoc(brute);
  const lecture = lireLaCommande(commande);
  const segments = avecLesAppels(segmentsDe(commande, lecture));
  const ici = dossierDeLaCommande(commande, cwd);
  const global =
    refusGlobal(commande, lecture, segments, { racine, cwd: ici, profil }) ?? (arrierePlan && profil.arrierePlanBorne ? arrierePlanInutile(segments) : null);
  if (global) return global;
  const dossiers = dossiersDesSegments(segments, cwd);
  const contexte = {
    racine,
    cwd: ici,
    profil,
    processus,
    nonSuivies,
    imagesDeLaCi,
    demande,
    humain,
    segments,
    dossiers,
    codeGarde: segmentsAuCodeGarde(segments),
    avantUnCommit: segmentsAvantUnCommit(segments),
  };
  for (const [rang, segment] of segments.entries()) {
    const lue = lireCommande(segment.mots);
    for (const ici of [dossiers[rang].ici, ...dossiers[rang].autres]) {
      const local = contexteDuSegment(lue, { ...dossiers[rang], ici }, contexte, depotDuDossier);
      for (const regle of REGLES_DU_SEGMENT) {
        const refus = regle(segment, lue, local);
        if (refus) return refus;
      }
    }
  }
  return null;
};

const ECRIVAINS = new Set(["rm", "rmdir", "unlink", "mv", "cp", "touch", "mkdir", "tee", "ln", "chmod", "chown", "truncate", "dd", "install", "patch"]);
const GIT_EN_LECTURE = new Set(["status", "diff", "log", "show", "grep", "ls-files", "ls-tree", "blame", "rev-parse", "cat-file", "merge-base", "describe", "shortlog"]);
const GESTIONNAIRES = new Set(["pnpm", "npm", "yarn", "bun"]);
const GESTION_QUI_ECRIT = new Set(["install", "i", "add", "remove", "rm", "uninstall", "un", "update", "up", "upgrade", "link", "unlink", "prune", "import", "patch", "patch-commit", "dedupe", "rebuild", "ci"]);
const DRAPEAUX_QUI_ECRIVENT = new Set(["--fix", "--write", "--apply", "-u", "--update", "--updateSnapshot", "--update-snapshots"]);

const ecritureDuSegment = (lue) => {
  const git = lireGit(lue);
  if (git !== null) return GIT_EN_LECTURE.has(git.verbe) ? null : `git ${git.verbe}`;
  if (ECRIVAINS.has(lue.nom) || editeSurPlace(lue)) return lue.nom;
  const verbe = lue.nom === "pnpm" ? lirePnpm(lue).script : lue.valeurs.find((valeur) => !valeur.startsWith("-"));
  if (GESTIONNAIRES.has(lue.nom) && GESTION_QUI_ECRIT.has(verbe)) return `${lue.nom} ${verbe}`;
  return lue.valeurs.find((valeur) => DRAPEAUX_QUI_ECRIVENT.has(valeur)) ?? null;
};

export const dossierDeLaCommande = (commande, cwd) => {
  const premier = segmentsDe(commande).find((segment) => !segment.horsChaine);
  const lue = premier === undefined ? null : lireCommande(premier.mots);
  return lue?.nom === "cd" ? (cibleDuCd(lue.valeurs, cwd) ?? cwd) : cwd;
};

export const reecritureDuShell = (commande) => {
  const remplacements = segmentsDe(commande)
    .filter((segment) => lireGit(lireCommande(segment.mots))?.verbe === "grep" && /\\b/.test(segment.texte) && !/\\[<>]/.test(segment.texte))
    .flatMap((segment) => segment.mots.map((mot) => ({ ...mot, perl: EN_PERL(mot.masque) })).filter(({ perl }) => perl !== null));
  if (remplacements.length === 0) return null;
  return remplacements.reduceRight((texte, { debut, masque, perl }) => texte.slice(0, debut) + perl + texte.slice(debut + masque.length), commande);
};

export const ecritureDuShell = (commande) => {
  const lecture = lireLaCommande(commande);
  if (/(^|[^<])<<(?!<)/.test(lecture.masque)) return "heredoc";
  const cible = redirectionDesPieces(commande, lecture, null);
  if (cible !== null) return `redirection vers ${cible}`;
  for (const segment of segmentsDe(commande, lecture)) {
    const ecriture = ecritureDuSegment(lireCommande(segment.mots));
    if (ecriture !== null) return ecriture;
  }
  return null;
};

function juger() {
  try {
    const entree = JSON.parse(readFileSync(0, "utf8"));
    if (entree.tool_name !== "Bash") return;
    const brute = String(entree.tool_input?.command ?? "");
    const reecrite = reecritureDuShell(brute);
    const commande = reecrite ?? brute;
    const cwd = entree.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const { racine, profil } = depotDe(dossierDeLaCommande(commande, cwd));
    const refus = refusDuShell(commande, {
      racine,
      cwd,
      profil,
      arrierePlan: entree.tool_input?.run_in_background === true,
      demande: derniereDemande(transcriptionDe(entree)),
      humain: reglagesDe().humain,
    });
    if (refus === null) {
      if (reecrite === null) return;
      const updatedInput = { ...entree.tool_input, command: reecrite };
      const additionalContext = `[garde-du-shell] réécrite : \`git grep -E\` ignore \`\\b\`, elle part en \`-P\` : ${reecrite}`;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput, additionalContext } }));
      return;
    }
    process.stderr.write(`[garde-du-shell] refus : ${refus}\n`);
    process.exitCode = 2;
  } catch (panne) {
    process.stderr.write(`[garde-du-shell] panne, commande laissée passer : ${panne}\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  juger();
}
