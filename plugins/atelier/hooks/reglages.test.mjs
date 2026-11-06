import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { HUMAIN_PAR_DEFAUT, initialiserLesReglages, nomDepuisGit, reglagesDe } from "./reglages.mjs";

const dossier = () => mkdtempSync(join(tmpdir(), "reglages-"));

test("le nom de celui qui décide se déduit du nom git, premier mot capitalisé", () => {
  assert.equal(nomDepuisGit("tim-M"), "Tim");
  assert.equal(nomDepuisGit("élodie Martin"), "Élodie");
  assert.equal(nomDepuisGit(""), HUMAIN_PAR_DEFAUT);
  assert.equal(nomDepuisGit(undefined), HUMAIN_PAR_DEFAUT);
});

test("sans fichier, les réglages valent le nom git et aucun profil, sans rien écrire", () => {
  const ici = dossier();
  assert.deepEqual(reglagesDe(ici, "tim-M"), { humain: "Tim", profils: {} });
  assert.equal(existsSync(join(ici, "atelier.json")), false);
});

test("la première conversation crée le fichier, les suivantes le lisent sans l'écraser", () => {
  const ici = dossier();
  assert.equal(initialiserLesReglages(ici, "tim-M"), true);
  assert.deepEqual(JSON.parse(readFileSync(join(ici, "atelier.json"), "utf8")), { humain: "Tim", profils: {} });
  writeFileSync(join(ici, "atelier.json"), JSON.stringify({ humain: "Timothée", profils: { boutique: { strykerEnPause: true } } }));
  assert.equal(initialiserLesReglages(ici, "tim-M"), false);
  assert.deepEqual(reglagesDe(ici, "tim-M"), { humain: "Timothée", profils: { boutique: { strykerEnPause: true } } });
});

test("un fichier illisible ou partiel retombe sur les valeurs déduites", () => {
  const ici = dossier();
  writeFileSync(join(ici, "atelier.json"), "{ pas du json");
  assert.deepEqual(reglagesDe(ici, "tim-M"), { humain: "Tim", profils: {} });
  writeFileSync(join(ici, "atelier.json"), JSON.stringify({ profils: { a: {} } }));
  assert.deepEqual(reglagesDe(ici, "tim-M"), { humain: "Tim", profils: { a: {} } });
});

test("sans dossier de données, les réglages restent déduits", () => {
  assert.deepEqual(reglagesDe(undefined, "tim-M"), { humain: "Tim", profils: {} });
  assert.equal(initialiserLesReglages(undefined, "tim-M"), false);
});
