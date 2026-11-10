import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { griefsDeLaCarte } from "./couverture.mjs";

const SCRIPT = fileURLToPath(new URL("./couverture.mjs", import.meta.url));

const depot = () => {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "couverture-")));
  spawnSync("git", ["init", "-q", racine]);
  mkdirSync(join(racine, "e2e"));
  writeFileSync(
    join(racine, "e2e", "dossier.spec.ts"),
    "test('CAS-001 · l'expert valide le dossier', () => {});\ntest('CAS-002 · le dirigeant ne voit pas Valider', () => {});\ntest('CAS-003 · le dirigeant ouvre le dossier', () => {});\n",
  );
  return racine;
};

const carte = () => ({
  depot: "x",
  roles: ["expert", "dirigeant"],
  ecrans: [
    {
      id: "E-dossier",
      titre: "Dossier",
      source: "front/dossier.component.ts:12",
      gestes: [
        { id: "G-ouvrir", libelle: "Ouvrir", source: "front/dossier.component.html:3" },
        { id: "G-valider", libelle: "Valider", source: "front/dossier.component.html:8" },
      ],
    },
  ],
  cas: [
    { id: "CAS-001", role: "expert", ecran: "E-dossier", geste: "G-valider", attendu: "autorise", e2e: "e2e/dossier.spec.ts :: CAS-001 · l'expert valide le dossier" },
    { id: "CAS-004", role: "expert", ecran: "E-dossier", geste: "G-ouvrir", attendu: "autorise", e2e: null },
    { id: "CAS-002", role: "dirigeant", ecran: "E-dossier", geste: "G-valider", attendu: "refuse", e2e: "e2e/dossier.spec.ts :: CAS-002 · le dirigeant ne voit pas Valider" },
    { id: "CAS-003", role: "dirigeant", ecran: "E-dossier", geste: "G-ouvrir", attendu: "autorise", e2e: "e2e/dossier.spec.ts :: CAS-003 · le dirigeant ouvre le dossier" },
  ],
});

test("chaque rôle a un cas, permis ou refusé, sur chaque geste de chaque écran", () => {
  const racine = depot();
  const document = carte();
  document.cas = document.cas.filter((cas) => cas.id !== "CAS-003");
  document.roles.push("collaborateur");
  const griefs = griefsDeLaCarte(document, racine).join("\n");
  assert.match(griefs, /dirigeant · E-dossier · G-ouvrir sans cas/);
  assert.match(griefs, /collaborateur · E-dossier · G-valider sans cas/);
  assert.doesNotMatch(griefs, /expert · E-dossier/);
});

test("un refus d'accès à l'écran couvre tous ses gestes pour ce rôle", () => {
  const racine = depot();
  const document = carte();
  document.roles.push("collaborateur");
  document.cas.push({ id: "CAS-005", role: "collaborateur", ecran: "E-dossier", geste: null, attendu: "refuse", e2e: "e2e/dossier.spec.ts :: CAS-005 · refus" });
  writeFileSync(join(racine, "e2e", "acces.spec.ts"), "test('CAS-005 · refus', () => {});\n");
  document.cas.at(-1).e2e = "e2e/acces.spec.ts :: CAS-005 · refus";
  assert.doesNotMatch(griefsDeLaCarte(document, racine).join("\n"), /collaborateur/);
});

test("un cas n'est couvert que par un test e2e réel dont le titre porte son identifiant", () => {
  const racine = depot();
  const document = carte();
  document.cas.push(
    { id: "CAS-006", role: "expert", ecran: "E-dossier", geste: "G-ouvrir", attendu: "autorise", e2e: "e2e/absent.spec.ts :: CAS-006 · ouvrir" },
    { id: "CAS-007", role: "expert", ecran: "E-dossier", geste: "G-ouvrir", attendu: "autorise", e2e: "e2e/dossier.spec.ts :: CAS-007 · inventé" },
    { id: "CAS-008", role: "expert", ecran: "E-dossier", geste: "G-ouvrir", attendu: "autorise", e2e: "e2e/dossier.spec.ts :: CAS-003 · le dirigeant ouvre le dossier" },
  );
  const griefs = griefsDeLaCarte(document, racine).join("\n");
  assert.match(griefs, /CAS-004 sans test e2e/);
  assert.match(griefs, /CAS-006 : e2e\/absent\.spec\.ts n'existe pas/);
  assert.match(griefs, /CAS-007 : e2e\/dossier\.spec\.ts ne contient pas « CAS-007 · inventé »/);
  assert.match(griefs, /CAS-008 : le titre « CAS-003 · le dirigeant ouvre le dossier » ne porte pas CAS-008/);
  assert.doesNotMatch(griefs, /^CAS-00[123] /m);
});

test("un cas qui nomme un rôle, un écran, un geste ou un attendu inconnu est refusé", () => {
  const racine = depot();
  const document = carte();
  document.cas.push({ id: "CAS-009", role: "stagiaire", ecran: "E-paie", geste: "G-payer", attendu: "peut-être", e2e: null });
  const griefs = griefsDeLaCarte(document, racine).join("\n");
  assert.match(griefs, /CAS-009 : rôle inconnu stagiaire/);
  assert.match(griefs, /CAS-009 : écran inconnu E-paie/);
  assert.match(griefs, /CAS-009 : attendu « peut-être » au lieu de autorise ou refuse/);
});

test("une carte sans rôle, sans écran ou sans cas n'est jamais couverte", () => {
  const racine = depot();
  assert.deepEqual(griefsDeLaCarte({ depot: "x" }, racine), ["carte vide : aucun rôle, aucun écran, aucun cas"]);
});

test("la ligne de commande rend COUVERT sur une carte complète, sinon la couverture et sort en 1", () => {
  const racine = depot();
  const chemin = join(dirname(racine), `${basename(racine)}-parcours.cas.json`);
  const document = { ...carte(), depot: basename(racine) };
  writeFileSync(chemin, JSON.stringify(document));
  const incomplet = spawnSync(process.execPath, [SCRIPT, chemin], { cwd: dirname(racine), encoding: "utf8" });
  assert.equal(incomplet.status, 1);
  assert.match(incomplet.stdout, /CAS-004 sans test e2e/);
  assert.match(incomplet.stdout, /couverture : 3\/4 cas/);
  writeFileSync(join(racine, "e2e", "ouvrir.spec.ts"), "test('CAS-004 · l'expert ouvre le dossier', () => {});\n");
  document.cas[1].e2e = "e2e/ouvrir.spec.ts :: CAS-004 · l'expert ouvre le dossier";
  writeFileSync(chemin, JSON.stringify(document));
  const complet = spawnSync(process.execPath, [SCRIPT, chemin], { cwd: dirname(racine), encoding: "utf8" });
  assert.equal(complet.stdout, "COUVERT : 4/4 cas, 2 rôles, 1 écran(s), 2 geste(s)\n");
  assert.equal(complet.status, 0);
});
