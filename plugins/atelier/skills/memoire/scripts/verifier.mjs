#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

const PROJETS = join(homedir(), ".claude", "projects");
const TYPES = new Set(["user", "feedback", "project", "reference"]);
const LIGNES_PAR_FICHE = 10;
const LIGNES_DU_ROUTEUR = 60;
const FICHIER_CITE = /`([A-Za-z0-9_.@-][^`\s*{}<>$|"']*\.[a-z]{1,5})(:\d[\d,-]*)?`/g;

const encoderCommeClaudeCode = (nom) => nom.replace(/[^A-Za-z0-9]/g, "-");

function entreesDe(dossier) {
  try {
    return readdirSync(dossier);
  } catch {
    return [];
  }
}

function depotDuProjet(nom) {
  const explorer = (racine, reste) => {
    if (reste === "") return racine;
    for (const entree of entreesDe(racine)) {
      const code = encoderCommeClaudeCode(entree);
      if (reste !== code && !reste.startsWith(`${code}-`)) continue;
      const candidat = join(racine, entree);
      if (!existsSync(candidat) || !statSync(candidat).isDirectory()) continue;
      const trouve = explorer(candidat, reste.slice(code.length + 1));
      if (trouve) return trouve;
    }
    return null;
  };
  return explorer("/", nom.slice(1));
}

function cheminExiste(chemin, depot, carnet) {
  const bases = depot ? [carnet, depot, ...voisins(depot)] : [carnet];
  return bases.some((b) => existsSync(join(b, chemin)));
}

const voisinsEnCache = new Map();
function voisins(depot) {
  if (!voisinsEnCache.has(depot)) {
    const parent = dirname(depot);
    voisinsEnCache.set(depot, readdirSync(parent).map((f) => join(parent, f)).filter((p) => p !== depot && statSync(p).isDirectory()));
  }
  return voisinsEnCache.get(depot);
}

function entete(texte) {
  const lignes = texte.split("\n");
  if (lignes[0] !== "---") return null;
  const fin = lignes.indexOf("---", 1);
  if (fin === -1) return null;
  const tete = lignes.slice(1, fin);
  const valeur = (k) => {
    const l = tete.find((x) => x.trim().startsWith(`${k}:`));
    return l ? l.trim().slice(k.length + 1).trim().replace(/^"(.*)"$/, "$1") : "";
  };
  return { valeur, corps: lignes.slice(fin + 1) };
}

function verifierUnCarnet(projet) {
  const carnet = join(PROJETS, projet, "memory");
  const griefs = [];
  const routeur = join(carnet, "MEMORY.md");
  const fiches = [];
  for (const dossier of [carnet, join(carnet, "fiches")]) {
    if (!existsSync(dossier)) continue;
    for (const f of readdirSync(dossier)) {
      const p = join(dossier, f);
      if (statSync(p).isFile() && f.endsWith(".md") && f !== "MEMORY.md") fiches.push(p);
    }
  }
  if (!existsSync(routeur)) return fiches.length === 0 ? [] : [`SANS MEMORY.md alors que ${fiches.length} fiches existent`];
  const texteDuRouteur = readFileSync(routeur, "utf8");
  const lignesDuRouteur = texteDuRouteur.trimEnd().split("\n").length;
  if (lignesDuRouteur > LIGNES_DU_ROUTEUR) griefs.push(`ROUTEUR TROP LONG : ${lignesDuRouteur} lignes > ${LIGNES_DU_ROUTEUR}`);
  const citees = new Set([...texteDuRouteur.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => join(carnet, m[1])));
  for (const c of citees) if (!existsSync(c)) griefs.push(`LIEN MORT dans MEMORY.md : ${c.slice(carnet.length + 1)}`);
  const noms = new Set(fiches.map((f) => basename(f, ".md")));
  const depot = depotDuProjet(projet);

  for (const f of fiches) {
    const court = f.slice(carnet.length + 1);
    if (!citees.has(f)) griefs.push(`NON ROUTÉE : ${court}`);
    const texte = readFileSync(f, "utf8");
    const e = entete(texte);
    if (!e) {
      griefs.push(`SANS FRONTMATTER : ${court}`);
      continue;
    }
    if (e.valeur("name") !== basename(f, ".md")) griefs.push(`NAME ≠ FICHIER : ${court}`);
    if (e.valeur("description") === "") griefs.push(`DESCRIPTION VIDE : ${court}`);
    if (!TYPES.has(e.valeur("type"))) griefs.push(`TYPE INVALIDE « ${e.valeur("type")} » : ${court}`);
    const corps = e.corps.filter((l) => l.trim() !== "").length;
    if (corps > LIGNES_PAR_FICHE) griefs.push(`FICHE TROP LONGUE : ${court} (${corps} lignes > ${LIGNES_PAR_FICHE})`);
    for (const m of texte.matchAll(/\[\[([^\]]+)\]\]/g)) if (!noms.has(m[1])) griefs.push(`LIEN MORT [[${m[1]}]] dans ${court}`);
    for (const m of texte.matchAll(FICHIER_CITE)) {
      if (m[1].includes("://") || m[1].startsWith("./") || m[1].startsWith("../../")) continue;
      if (m[2]) griefs.push(`NUMÉRO DE LIGNE dans ${court} : ${m[1]}${m[2]} (il dérive : citer le fichier ou le symbole)`);
      if (m[1].includes("/") && !cheminExiste(m[1], depot, carnet)) griefs.push(`CHEMIN ABSENT dans ${court} : ${m[1]}`);
    }
  }
  return griefs;
}

const cible = process.argv[2];
const projets = readdirSync(PROJETS).filter((p) => existsSync(join(PROJETS, p, "memory")) && (!cible || p.includes(cible)));
let total = 0;
for (const projet of projets) {
  const griefs = verifierUnCarnet(projet);
  total += griefs.length;
  if (griefs.length > 0) console.log(`${projet}\n  ${griefs.join("\n  ")}`);
}
console.log(total === 0 ? `AUCUN GRIEF sur ${projets.length} carnets` : `${total} griefs`);
process.exit(total === 0 ? 0 : 1);
