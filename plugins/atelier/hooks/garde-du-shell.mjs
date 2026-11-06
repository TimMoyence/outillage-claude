#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PROFIL_GENERIQUE, depotDe } from "./depots.mjs";
import { derniereDemande, transcriptionDe } from "./fichiers-du-tour.mjs";
import { HUMAIN_PAR_DEFAUT, reglagesDe } from "./reglages.mjs";

const de = (humain) => (/^[aeiouyàâäéèêëîïôöùûü]/iu.test(humain) ? `d'${humain}` : `de ${humain}`);

export const masquer = (commande) => {
  let masque = "";
  let citation = null;
  for (let rang = 0; rang < commande.length; rang += 1) {
    const caractere = commande[rang];
    if (caractere === "\\" && citation !== "'" && rang + 1 < commande.length) {
      masque += "__";
      rang += 1;
    } else if (citation !== null) {
      masque += caractere === citation ? caractere : "_";
      if (caractere === citation) citation = null;
    } else {
      if (caractere === "'" || caractere === '"') citation = caractere;
      masque += caractere;
    }
  }
  return masque;
};

const sansCitation = (mot) => mot.replace(/^(["'])(.*)\1$/s, "$2");

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

export const segmentsDe = (commande, masque = masquer(commande)) => {
  const segments = [];
  let debut = 0;
  const clore = (fin, lien) => {
    segments.push({ mots: motsDe(commande, masque, debut, fin), texte: commande.slice(debut, fin), lien });
    debut = fin + lien.length;
  };
  for (let rang = 0; rang < masque.length; rang += 1) {
    const [precedent, caractere, suivant] = [masque.charAt(rang - 1), masque.charAt(rang), masque.charAt(rang + 1)];
    if ((caractere === "|" || caractere === "&") && suivant === caractere) {
      clore(rang, caractere + suivant);
      rang += 1;
    } else if (caractere === "|" || "();\n".includes(caractere) || (caractere === "&" && precedent !== ">" && suivant !== ">")) clore(rang, caractere);
  }
  clore(masque.length, "");
  return segments.filter((segment) => segment.mots.length > 0);
};

const PRECOMMANDES = new Set(["rtk", "proxy", "time", "env", "nice", "command", "builtin", "noglob", "exec", "do", "then", "else", "if", "while", "until", "!", "{"]);
const ENVELOPPES = new Map([
  ["caffeinate", { aValeur: new Set(["-t", "-w"]), positionnels: 0 }],
  ["nohup", { aValeur: new Set(), positionnels: 0 }],
  ["timeout", { aValeur: new Set(["-s", "--signal", "-k", "--kill-after"]), positionnels: 1 }],
  ["gtimeout", { aValeur: new Set(["-s", "--signal", "-k", "--kill-after"]), positionnels: 1 }],
]);
const REDIRECTION = /^(\d*|&)(>>?|<)/;
const OPERATEUR_DE_REDIRECTION = /^(\d*|&)(>>?|<)&?$/;

export const lireCommande = (mots) => {
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
  return { nom: mots[rang]?.valeur ?? "", args, valeurs: args.map((mot) => mot.valeur), affectations };
};

const OPTIONS_GIT_A_VALEUR = new Set(["-C", "-c", "--git-dir", "--work-tree", "--exec-path", "--namespace"]);

const lireGit = (commande) => {
  if (commande.nom !== "git") return null;
  const { valeurs } = commande;
  let rang = 0;
  let dossier = ".";
  while (rang < valeurs.length && valeurs[rang].startsWith("-")) {
    if (valeurs[rang] === "-C") dossier = valeurs[rang + 1] ?? ".";
    rang += OPTIONS_GIT_A_VALEUR.has(valeurs[rang]) ? 2 : 1;
  }
  return { verbe: valeurs[rang] ?? "", args: valeurs.slice(rang + 1), dossier };
};

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

const VARIABLES_DE_SAUT = /^(HUSKY|LEFTHOOK|LEFTHOOK_SKIP|LEFTHOOK_EXCLUDE|SKIP_PRE\w*)$/;

const contournementDesHooks = (_segment, commande) => {
  const git = lireGit(commande);
  const sautDeHook =
    commande.affectations.some((nom) => VARIABLES_DE_SAUT.test(nom)) ||
    (git !== null && commande.valeurs.some((valeur) => /core\.hookspath/i.test(valeur))) ||
    (git?.verbe === "commit" && git.args.some((arg) => arg === "--no-verify" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(arg))) ||
    (git?.verbe === "push" && git.args.includes("--no-verify"));
  return sautDeHook
    ? "les hooks du dépôt ne se contournent jamais (`--no-verify`, `-n`, `HUSKY=0`, `LEFTHOOK*`, `SKIP_PRE_*`, `core.hooksPath`) : un rouge du pre-commit ou du pre-push se corrige."
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

const GESTES_GIT_REFUSES = {
  stash: (args) => !["list", "show"].includes(args[0]),
  clean: () => true,
  rm: (args, _base, partage) => partage || args.some((arg) => arg === "--cached" || arg === "." || /[*?]/.test(arg)),
  add: (args, base) => args.some((arg) => AJOUTS_EN_MASSE.has(arg) || /[*?]/.test(arg) || estUnDossier(resolve(base, arg))),
  commit: (args, base) =>
    args.some((arg) => arg === "--all" || /^-[a-zA-Z]*a/.test(arg)) ||
    (!args.includes("--") && !args.some((arg) => arg.startsWith("--pathspec-from-file")) && !fusionEnCours(base)),
  restore: (args) => !args.some((arg) => ["--staged", "-S"].includes(arg)) || args.some((arg) => ["--worktree", "-W"].includes(arg)),
  checkout: (args) => args.includes("--") || args.includes("."),
  reset: (args) => args.some((arg) => ["--hard", "--keep", "--merge"].includes(arg)),
};

const gesteGit = (_segment, commande, { cwd, profil }) => {
  const git = lireGit(commande);
  const partage = profil.arbrePartage === true;
  const refuse = git && Object.hasOwn(GESTES_GIT_REFUSES, git.verbe) ? GESTES_GIT_REFUSES[git.verbe] : null;
  if (!refuse?.(git.args, resolve(cwd, git.dossier), partage)) return null;
  return (
    `\`git ${git.verbe}\` sous cette forme jette du travail non commité ou embarque des fichiers non relus` +
    (partage ? ", ceux des sessions voisines compris (arbre partagé). " : ". ") +
    "On nomme les fichiers : `git add <fichiers neufs>`, puis `git commit -F <msg> -- <chemins>` ; " +
    (partage ? "un fichier se supprime par `rm`, puis entre au commit par son chemin" : "un fichier suivi se supprime par `git rm <fichier>`") +
    " ; `git restore --staged <f>` seul retire de l'index."
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
  gesteGit,
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

const refusGlobal = (commande, masque, segments, ou) => {
  const heredoc = segments.some((segment) => /(^|[^<])<<(?!<)/.test(masquer(segment.texte)));
  if (heredoc && segments.some((segment) => INTERPRETES.has(lireCommande(segment.mots).nom)))
    return `heredoc qui nourrit un interpréteur. ${EDITION}`;
  if (segments.some((segment) => editeSurPlace(lireCommande(segment.mots)))) return EDITION;
  if (ou.profil.baseParSession && /DATABASE_URL=["']?postgres(ql)?:\/\//.test(commande))
    return "jamais d'URL de base saisie : des composants `POSTGRES_*` explicites, ou la base de la session par `eval \"$(bash scripts/test-space.sh env --id <lot>)\"`.";
  const cible = redirectionHorsTemporaire(commande, masque, ou);
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
    arrierePlan = false,
    processus = lireProcessus,
    nonSuivies = () => lireNonSuivies(racine, profil.migrations?.dossier),
    imagesDeLaCi = () => lireImagesDeLaCi(racine),
    demande,
    humain = HUMAIN_PAR_DEFAUT,
  },
) => {
  const commande = sansCorpsDeHeredoc(brute);
  const masque = masquer(commande);
  const segments = segmentsDe(commande, masque);
  const global =
    refusGlobal(commande, masque, segments, { racine, cwd, profil }) ?? (arrierePlan && profil.arrierePlanBorne ? arrierePlanInutile(segments) : null);
  if (global) return global;
  const contexte = {
    racine,
    cwd,
    profil,
    processus,
    nonSuivies,
    imagesDeLaCi,
    demande,
    humain,
    codeGarde: segmentsAuCodeGarde(segments),
    avantUnCommit: segmentsAvantUnCommit(segments),
  };
  for (const segment of segments) {
    const lue = lireCommande(segment.mots);
    for (const regle of REGLES_DU_SEGMENT) {
      const refus = regle(segment, lue, contexte);
      if (refus) return refus;
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
  const [premier] = segmentsDe(commande);
  if (premier === undefined) return cwd;
  const { nom, valeurs } = lireCommande(premier.mots);
  if (nom !== "cd" || valeurs.length !== 1 || valeurs[0].includes("$") || valeurs[0] === "-") return cwd;
  return valeurs[0] === "~" || valeurs[0].startsWith("~/")
    ? join(homedir(), valeurs[0].slice(1))
    : resolve(cwd, valeurs[0]);
};

export const reecritureDuShell = (commande) => {
  const remplacements = segmentsDe(commande)
    .filter((segment) => lireGit(lireCommande(segment.mots))?.verbe === "grep" && /\\b/.test(segment.texte) && !/\\[<>]/.test(segment.texte))
    .flatMap((segment) => segment.mots.map((mot) => ({ ...mot, perl: EN_PERL(mot.masque) })).filter(({ perl }) => perl !== null));
  if (remplacements.length === 0) return null;
  return remplacements.reduceRight((texte, { debut, masque, perl }) => texte.slice(0, debut) + perl + texte.slice(debut + masque.length), commande);
};

export const ecritureDuShell = (commande) => {
  const masque = masquer(commande);
  if (/(^|[^<])<<(?!<)/.test(masque)) return "heredoc";
  const cible = redirectionHorsTemporaire(commande, masque, null);
  if (cible !== null) return `redirection vers ${cible}`;
  for (const segment of segmentsDe(commande, masque)) {
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
    const cwd = dossierDeLaCommande(commande, entree.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
    const { racine, profil } = depotDe(cwd);
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
