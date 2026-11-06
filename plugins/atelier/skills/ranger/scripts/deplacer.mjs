#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CODE = /\.(c|m)?(t|j)sx?$/;
const STYLE = /\.s?css$/;
const DOC = /\.md$/;

const fichiersSuivis = (racine, autres) =>
  spawnSync("git", ["-C", racine, "ls-files", ...(autres ? ["-co", "--exclude-standard"] : [])], { encoding: "utf8" })
    .stdout.split("\n")
    .filter(Boolean);

const lireTexte = (racine, chemin) => {
  const octets = readFileSync(posix.join(racine, chemin));
  return octets.includes(0) ? null : octets.toString("utf8");
};

const nature = (absolu) => (existsSync(absolu) ? (statSync(absolu).isDirectory() ? "dossier" : "fichier") : null);

const candidats = (base, style) =>
  style
    ? [
        [base, ""],
        [`${base}.scss`, ".scss"],
        [posix.join(posix.dirname(base), `_${posix.basename(base)}.scss`), "partiel"],
        [`${base}.css`, ".css"],
      ]
    : [[base, ""], ...[".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"].map((ext) => [`${base}${ext}`, ext]), [posix.join(base, "index.ts"), "index"], [posix.join(base, "index.js"), "index"]];

const cibleDe = (racine, dossier, specificateur, style) => {
  const base = posix.join(dossier, specificateur);
  for (const [chemin, forme] of candidats(base, style)) {
    if (nature(posix.join(racine, chemin)) === "fichier") return { chemin, forme };
  }
  return nature(posix.join(racine, base)) === "dossier" ? { chemin: base, forme: "dossier" } : null;
};

const formeDe = (chemin, forme) => {
  if (forme === "index") return posix.dirname(chemin);
  if (forme === "partiel") return posix.join(posix.dirname(chemin), posix.basename(chemin, ".scss").replace(/^_/, ""));
  return forme && forme !== "dossier" ? chemin.slice(0, -forme.length) : chemin;
};

const relatif = (de, vers, nu) => {
  const chemin = posix.relative(de, vers) || ".";
  return chemin.startsWith(".") || nu ? chemin : `./${chemin}`;
};

const POSITIONS_CODE = [
  /\b(?:from|import)\s*(['"])([^'"\n]+)\1/g,
  /\b(?:import|require|jest\.mock|jest\.requireActual|vi\.mock)\(\s*(['"])([^'"\n]+)\1/g,
  /new URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url/g,
  /createRequire\(import\.meta\.url\)\(\s*(['"])([^'"\n]+)\1/g,
  /\b(?:templateUrl|styleUrl)\s*:\s*(['"])([^'"\n]+)\1/g,
];
const POSITIONS_STYLE = [/@(?:use|forward|import)\s+(['"])([^'"\n]+)\1/g, /url\(\s*(['"]?)(\.{1,2}\/[^'")\s]+)\1\s*\)/g];
const POSITIONS_DOC = [/\]\((\.{1,2}\/[^)\s#]+)/g];
const BASE = String.raw`(?:__dirname|import\.meta\.dirname|dirname\(fileURLToPath\(import\.meta\.url\)\))`;
const JETON = /[A-Za-z0-9_@.\-/*]+/g;
const LU_DEPUIS_LA_RACINE = /(^|\/)(package\.json|Dockerfile)$|\.ya?ml$|^\.husky\//;
const SUITE_APRES_BASE = new RegExp(String.raw`\b(?:join|resolve)\(\s*${BASE}((?:\s*,\s*(['"])[^'"\n]*\2)+)`, "g");
const FORMES_RECONNUES = [SUITE_APRES_BASE, /new URL\(\s*(['"])[^'"\n]+\1\s*,\s*import\.meta\.url\s*\)/g, /===\s*fileURLToPath\(import\.meta\.url\)/g, /createRequire\(import\.meta\.url\)(?=\()/g, /\brequire\s*=\s*createRequire\(import\.meta\.url\)/g];
const GLOB = /(['"`])([^'"`\n]*\*[^'"`\n]*)\1/g;

const ligne = (texte, index) => texte.slice(0, index).split("\n").length;

const dossiersDe = (chemins) =>
  new Set(
    chemins.flatMap((chemin) => {
      const parents = [];
      for (let parent = posix.dirname(chemin); parent !== "."; parent = posix.dirname(parent)) parents.push(parent);
      return parents;
    }),
  );

const designes = (glob, lecteur, chemins) => {
  const motif = glob.startsWith(".") ? posix.join(posix.dirname(lecteur), glob) : glob.replace(/^\//, "");
  return chemins.filter((chemin) => {
    try {
      return posix.matchesGlob(chemin, motif) || posix.matchesGlob(chemin.replace(/\.[^/.]+$/, ""), motif);
    } catch {
      return false;
    }
  });
};

const refusDuPlan = (racine, deplacements, suivis) => {
  const presents = new Set(suivis);
  const parDestination = new Map();
  const refus = existsSync(posix.join(racine, "package.json")) && !existsSync(posix.join(racine, "node_modules")) ? ["node_modules absent : installe les dépendances avant de ranger"] : [];
  for (const [ancien, neuf] of Object.entries(deplacements)) {
    if (!presents.has(ancien) || !existsSync(posix.join(racine, ancien))) refus.push(`source absente : ${ancien} — retire-la du plan`);
    if (existsSync(posix.join(racine, neuf))) refus.push(`destination occupée : ${neuf} — choisis une autre destination`);
    parDestination.set(neuf, [...(parDestination.get(neuf) ?? []), ancien]);
  }
  for (const [neuf, anciens] of parDestination) if (anciens.length > 1) refus.push(`deux sources vers ${neuf} : ${anciens.join(", ")}`);
  return refus;
};

export const ranger = (racine, plan) => {
  const deplacements = plan.deplacements ?? {};
  const dossiers = plan.dossiers ?? {};
  const nouvelle = (chemin) => {
    if (deplacements[chemin]) return deplacements[chemin];
    const dossier = Object.keys(dossiers).find((ancien) => chemin === ancien || chemin.startsWith(`${ancien}/`));
    return dossier ? `${dossiers[dossier]}${chemin.slice(dossier.length)}` : chemin;
  };
  const bouge = (chemin) => nouvelle(chemin) !== chemin;
  const suivis = fichiersSuivis(racine, true);
  const suivisApres = suivis.map(nouvelle);
  const refus = refusDuPlan(racine, deplacements, suivis);
  for (const dossier of Object.keys(dossiers)) {
    const reste = suivis.find((chemin) => chemin.startsWith(`${dossier}/`) && !deplacements[chemin]);
    if (reste) refus.push(`plan.dossiers ${dossier} ne disparaît pas : ${reste} y reste — ajoute-le à deplacements ou retire la déclaration`);
  }
  const restants = dossiersDe(suivisApres);
  const disparus = [...dossiersDe(suivis)].filter((dossier) => !restants.has(dossier) && !bouge(dossier));
  const disparuDe = (coeur) => disparus.find((dossier) => coeur === dossier || coeur.startsWith(`${dossier}/`));

  const recalculer = (lecteur, specificateur, style) => {
    const relatifExplicite = specificateur.startsWith(".");
    if (!relatifExplicite && !(style && !specificateur.includes(":"))) return specificateur;
    const cible = cibleDe(racine, posix.dirname(lecteur), specificateur, style);
    if (!cible || !(bouge(lecteur) || bouge(cible.chemin))) return specificateur;
    const vers = formeDe(nouvelle(cible.chemin), cible.forme);
    return relatif(posix.dirname(nouvelle(lecteur)), vers, style && !relatifExplicite);
  };

  const reecrire = (lecteur, texte) => {
    const enStyle = (motifs) => motifs.map((motif) => [motif, true]);
    const enCode = (motifs) => motifs.map((motif) => [motif, false]);
    const positions = CODE.test(lecteur)
      ? [...enCode(POSITIONS_CODE), ...enStyle(POSITIONS_STYLE)]
      : STYLE.test(lecteur)
        ? enStyle(POSITIONS_STYLE)
        : DOC.test(lecteur)
          ? enCode(POSITIONS_DOC)
          : [];
    let resultat = texte;
    for (const [motif, style] of positions) {
      resultat = resultat.replace(motif, (tout, ...groupes) => {
        const specificateur = motif === POSITIONS_DOC[0] ? groupes[0] : groupes[1];
        const nouveau = recalculer(lecteur, specificateur, style);
        return nouveau === specificateur ? tout : tout.replace(specificateur, nouveau);
      });
    }
    if (CODE.test(lecteur)) {
      resultat = resultat.replace(/\bstyleUrls\s*:\s*\[[^\]]*\]/g, (liste) =>
        liste.replace(/(['"])([^'"\n]+)\1/g, (tout, guillemet, specificateur) => `${guillemet}${recalculer(lecteur, specificateur, false)}${guillemet}`),
      );
      resultat = resultat.replace(SUITE_APRES_BASE, (tout, suite, guillemet) => {
        const segments = [...suite.matchAll(/(['"])([^'"\n]*)\1/g)].map((m) => m[2]);
        const cible = posix.join(posix.dirname(lecteur), ...segments);
        if (!nature(posix.join(racine, cible)) || !(bouge(lecteur) || bouge(cible))) return tout;
        const nouveau = posix.relative(posix.dirname(nouvelle(lecteur)), nouvelle(cible)) || ".";
        return tout.replace(suite, `, ${guillemet}${nouveau}${guillemet}`);
      });
    }
    const lueDepuisLaRacine = LU_DEPUIS_LA_RACINE.test(lecteur);
    return resultat.replace(JETON, (jeton, index, chaine) => {
      const pointe = lueDepuisLaRacine && jeton.startsWith("./") ? "./" : "";
      const [, avant, coeur, apres] = jeton.slice(pointe.length).match(/^(\/?)(.*?)([./]*)$/);
      if (!coeur.includes("/") || coeur.startsWith(".")) return jeton;
      if (!bouge(coeur)) {
        if (disparuDe(coeur)) refus.push(`${lecteur}:${ligne(chaine, index)} désigne ${coeur}, qui disparaît : déclare-le dans plan.dossiers`);
        return jeton;
      }
      return `${pointe}${avant}${nouvelle(coeur)}${apres}`;
    });
  };

  const refusDeBase = (lecteur, texte) => {
    if (!CODE.test(lecteur) || !bouge(lecteur)) return;
    const masque = FORMES_RECONNUES.reduce((courant, forme) => courant.replace(forme, (tout) => " ".repeat(tout.length)), texte);
    for (const trouve of masque.matchAll(/__dirname|import\.meta\.dirname|import\.meta\.url/g)) {
      refus.push(`${lecteur}:${ligne(masque, trouve.index)} construit un chemin depuis ${trouve[0]} hors d'une forme reconnue : écris join(__dirname, '<chemin>') ou déclare le texte dans plan.reecritures`);
    }
  };

  const refusDeGlobs = (lecteur, lu, apres) => {
    const nomme = (trouve) => /[A-Za-z0-9_]|^\.{1,2}\//.test(trouve[2]);
    const sansEchappement = (texte) => texte.replaceAll('\\"', '"');
    const luSansEchappement = sansEchappement(lu);
    const anciens = [...luSansEchappement.matchAll(GLOB)].filter(nomme);
    const neufs = [...sansEchappement(apres).matchAll(GLOB)].filter(nomme);
    anciens.forEach((ancien, rang) => {
      const neuf = neufs[rang]?.[2] ?? ancien[2];
      const avant = new Map(designes(ancien[2], lecteur, suivis).map((chemin) => [nouvelle(chemin), chemin]));
      const ensuite = new Set(designes(neuf, nouvelle(lecteur), suivisApres));
      const sortants = [...avant].filter(([chemin]) => !ensuite.has(chemin)).map(([, origine]) => origine);
      const entrants = [...ensuite].filter((chemin) => !avant.has(chemin));
      const cle = `${lecteur} → ${neuf}`;
      if (sortants.length + entrants.length === 0 || (plan.globs_acceptes ?? []).includes(cle)) return;
      refus.push(
        `${lecteur}:${ligne(luSansEchappement, ancien.index)} le glob ${ancien[2]} change (sortants : ${sortants.join(", ") || "aucun"} ; entrants : ${entrants.join(", ") || "aucun"}) : réécris-le par plan.reecritures ou accepte-le par plan.globs_acceptes « ${cle} »`,
      );
    });
  };

  const reecritures = [];
  for (const chemin of suivis) {
    const lu = existsSync(posix.join(racine, chemin)) ? lireTexte(racine, chemin) : null;
    if (lu === null) continue;
    const remplacements = Object.entries(plan.reecritures?.[chemin] ?? {});
    for (const [ancien] of remplacements) if (!lu.includes(ancien)) refus.push(`${chemin} : le remplacement « ${ancien} » ne trouve rien`);
    const texte = remplacements.reduce((courant, [ancien, neuf]) => courant.replaceAll(ancien, neuf), lu);
    refusDeBase(chemin, texte);
    const apres = reecrire(chemin, texte);
    refusDeGlobs(chemin, lu, apres);
    if (apres !== lu) reecritures.push({ chemin, apres });
  }
  for (const chemin of Object.keys(plan.reecritures ?? {})) if (!suivis.includes(chemin)) refus.push(`${chemin} : fichier à réécrire absent`);
  return { refus, deplacements: Object.entries(deplacements), reecritures };
};

export const appliquer = (racine, { deplacements, reecritures }) => {
  for (const { chemin, apres } of reecritures) writeFileSync(posix.join(racine, chemin), apres);
  const suivis = new Set(fichiersSuivis(racine, false));
  for (const [ancien, nouveau] of deplacements) {
    mkdirSync(posix.dirname(posix.join(racine, nouveau)), { recursive: true });
    if (suivis.has(ancien)) spawnSync("git", ["-C", racine, "mv", ancien, nouveau]);
    else renameSync(posix.join(racine, ancien), posix.join(racine, nouveau));
  }
};

const decrire = ({ deplacements, reecritures }) =>
  [...deplacements.map(([ancien, nouveau]) => `${ancien} → ${nouveau}`), ...reecritures.map(({ chemin }) => `réécrit ${chemin}`)].join("\n");

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const racine = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim();
  const plan = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const resultat = ranger(racine, plan);
  if (resultat.refus.length > 0) {
    process.stderr.write(`Plan refusé, rien n'a bougé :\n${resultat.refus.map((cause) => `- ${cause}`).join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(`${decrire(resultat)}\n`);
  if (!process.argv.includes("--a-blanc")) appliquer(racine, resultat);
  process.stdout.write(`${resultat.deplacements.length} déplacements · ${resultat.reecritures.length} fichiers réécrits\n`);
}
