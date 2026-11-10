#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cheminDe, racineDuLot } from "../../livrer/scripts/etat-du-lot.mjs";

const ATTENDUS = ["autorise", "refuse"];

const titreDe = (reference) => String(reference ?? "").split(" :: ").slice(1).join(" :: ").trim();

const griefsDuCas = (cas, carte, racine) => {
  const ecran = carte.ecrans.find(({ id }) => id === cas.ecran);
  const references = [
    ...(carte.roles.includes(cas.role) ? [] : [`rôle inconnu ${cas.role}`]),
    ...(ecran ? [] : [`écran inconnu ${cas.ecran}`]),
    ...(!ecran || cas.geste === null || (ecran.gestes ?? []).some(({ id }) => id === cas.geste) ? [] : [`geste inconnu ${cas.geste} sur ${cas.ecran}`]),
    ...(ATTENDUS.includes(cas.attendu) ? [] : [`attendu « ${cas.attendu} » au lieu de ${ATTENDUS.join(" ou ")}`]),
  ].map((grief) => `${cas.id} : ${grief}`);
  if (!cas.e2e) return [...references, `${cas.id} sans test e2e`];
  const [chemin, titre] = [cheminDe(cas.e2e), titreDe(cas.e2e)];
  const couverture = !existsSync(join(racine, chemin))
    ? `${chemin} n'existe pas`
    : !titre.includes(cas.id)
      ? `le titre « ${titre} » ne porte pas ${cas.id}`
      : readFileSync(join(racine, chemin), "utf8").includes(titre)
        ? null
        : `${chemin} ne contient pas « ${titre} »`;
  return [...references, ...(couverture === null ? [] : [`${cas.id} : ${couverture}`])];
};

const griefsDesTrous = (carte) =>
  carte.roles.flatMap((role) =>
    carte.ecrans.flatMap((ecran) => {
      const casDuRole = carte.cas.filter((cas) => cas.role === role && cas.ecran === ecran.id);
      if (casDuRole.some((cas) => cas.geste === null && cas.attendu === "refuse")) return [];
      return (ecran.gestes ?? []).filter((geste) => !casDuRole.some((cas) => cas.geste === geste.id)).map((geste) => `${role} · ${ecran.id} · ${geste.id} sans cas`);
    }),
  );

const carteDe = (document) => ({ roles: [], ecrans: [], cas: [], ...document });

export const griefsDeLaCarte = (document, racine) => {
  const carte = carteDe(document);
  if ([carte.roles, carte.ecrans, carte.cas].some((liste) => liste.length === 0)) return ["carte vide : aucun rôle, aucun écran, aucun cas"];
  return [...griefsDesTrous(carte), ...carte.cas.flatMap((cas) => griefsDuCas(cas, carte, racine))];
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chemin = process.argv[2];
  const carte = carteDe(JSON.parse(readFileSync(chemin, "utf8")));
  const griefs = griefsDeLaCarte(carte, racineDuLot(carte, chemin, process.cwd()));
  const { cas } = carte;
  const couverts = cas.filter((unCas) => !griefs.some((grief) => grief.startsWith(`${unCas.id} `))).length;
  const gestes = carte.ecrans.flatMap((ecran) => ecran.gestes ?? []).length;
  process.stdout.write(
    griefs.length === 0
      ? `COUVERT : ${cas.length}/${cas.length} cas, ${carte.roles.length} rôles, ${carte.ecrans.length} écran(s), ${gestes} geste(s)\n`
      : `${griefs.join("\n")}\ncouverture : ${couverts}/${cas.length} cas\n`,
  );
  process.exitCode = griefs.length === 0 ? 0 : 1;
}
