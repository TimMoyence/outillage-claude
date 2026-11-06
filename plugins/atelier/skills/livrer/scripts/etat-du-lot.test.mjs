import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { causeDuRouge, empreinteDeLaStep, empreinteDuLot, griefsDuLivrable } from "./etat-du-lot.mjs";

const SCRIPT = fileURLToPath(new URL("./etat-du-lot.mjs", import.meta.url));

const depot = () => {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "etat-du-lot-")));
  spawnSync("git", ["init", "-q", racine]);
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 8;\n");
  writeFileSync(join(racine, "heures.test.mjs"), "test('pause', () => {});\n");
  return racine;
};

const empreinteDe = (racine, chemin) => spawnSync("git", ["-C", racine, "hash-object", chemin], { encoding: "utf8" }).stdout.trim();

const lotVert = (racine, mode = "bug") => {
  const lot = {
    lot: "pause",
    mode,
    contrat: { must: ["la pause se déduit"], must_not: [], risques: [], valide: null, critique: null },
    carte: { prod: ["heures.mjs"], tests: ["heures.test.mjs"] },
    base: { sha: "abc", rouges_connus: [] },
    steps: [
      {
        id: "S1",
        test: "heures.test.mjs :: pause",
        prod: ["heures.mjs"],
        etat: "vert",
        sha_test: empreinteDe(racine, "heures.test.mjs"),
        avant: { "heures.mjs": null },
        preuve: "ROUGE … · VERT node --test → EXIT=0",
      },
    ],
    final: { audit: { shortstat: "1 file changed", duplications: "dup:ast 0", jumelles: "aucune" }, breaker: { status: "CLEAR", empreinte: null } },
  };
  lot.steps[0].contre_preuve =
    mode === "refactor" ? { exit: 0, cause: null, empreinte: empreinteDeLaStep(lot.steps[0], racine) } : { exit: 1, cause: "assertion", empreinte: empreinteDeLaStep(lot.steps[0], racine) };
  lot.final.breaker.empreinte = empreinteDuLot(lot, racine);
  return lot;
};

const { NODE_TEST_CONTEXT: _contexteDuLanceur, ...HORS_DU_LANCEUR } = process.env;
const etat = (racine, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: racine, encoding: "utf8", env: HORS_DU_LANCEUR });
const contrePreuveDe = (racine, tasklist) => etat(racine, tasklist, "--contre-preuve", "S1");

const depotAvecBase = (testDeLaStep) => {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "contre-preuve-")));
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 10;\n");
  writeFileSync(join(racine, "heures.test.mjs"), testDeLaStep);
  const lot = {
    lot: "pause",
    mode: "bug",
    contrat: { must: ["la pause se déduit"] },
    carte: { prod: ["heures.mjs"], tests: ["heures.test.mjs"] },
    steps: [{ id: "S1", test: "heures.test.mjs :: pause", prod: ["heures.mjs"], cmd: "node --test heures.test.mjs", etat: "vert", preuve: "x" }],
  };
  const tasklist = join(racine, "..", `${racine.split("/").pop()}-pause.tasklist.json`);
  writeFileSync(tasklist, JSON.stringify(lot, null, 2));
  const gel = etat(racine, tasklist, "--gel", "S1");
  assert.equal(gel.status, 0, gel.stdout + gel.stderr);
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 8;\n");
  return { racine, tasklist };
};

test("le gel fige le test et photographie la production d'avant la step", () => {
  const { racine, tasklist } = depotAvecBase(TEST_QUI_PASSE_TOUJOURS);
  const step = JSON.parse(readFileSync(tasklist, "utf8")).steps[0];
  assert.equal(step.sha_test, empreinteDe(racine, "heures.test.mjs"));
  assert.deepEqual(step.avant, { "heures.mjs": Buffer.from("export const heures = () => 10;\n").toString("base64") });
});

const lotSansModule = (mode) => {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "gel-")));
  writeFileSync(join(racine, "heures.test.mjs"), TEST_QUI_PASSE_TOUJOURS);
  const tasklist = join(racine, "..", `${racine.split("/").pop()}-neuf.tasklist.json`);
  writeFileSync(tasklist, JSON.stringify({ lot: "neuf", mode, steps: [{ id: "S1", test: "heures.test.mjs :: pause", prod: ["heures.mjs"], cmd: "node --test heures.test.mjs" }] }));
  return { racine, tasklist };
};

const contrePreuveSurSquelette = (squelette) => {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "squelette-")));
  writeFileSync(join(racine, "heures.mjs"), squelette);
  writeFileSync(join(racine, "heures.test.mjs"), TEST_DE_LA_REGLE);
  const tasklist = join(racine, "..", `${racine.split("/").pop()}-neuf.tasklist.json`);
  writeFileSync(tasklist, JSON.stringify({ lot: "neuf", mode: "bug", steps: [{ id: "S1", test: "heures.test.mjs :: pause", prod: ["heures.mjs"], cmd: "node --test heures.test.mjs", etat: "vert", preuve: "x" }] }));
  assert.equal(etat(racine, tasklist, "--gel", "S1").status, 0);
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 8;\n");
  return { racine, tasklist, sortie: contrePreuveDe(racine, tasklist) };
};

test("un rouge de chargement n'est pas le rouge de la regle : squelette vide ou sans le symbole importe", () => {
  for (const squelette of ["", "export const autre = () => 0;\n"]) {
    const { racine, tasklist, sortie } = contrePreuveSurSquelette(squelette);
    assert.equal(sortie.status, 1, `${JSON.stringify(squelette)} : ${sortie.stdout}`);
    assert.match(sortie.stdout, /rouge de chargement/);
    const lot = JSON.parse(readFileSync(tasklist, "utf8"));
    assert.equal(lot.steps[0].contre_preuve.cause, "chargement");
    assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 : la contre-preuve rougit au chargement, pas sur l'assertion de la règle/);
  }
  const { tasklist, sortie } = contrePreuveSurSquelette("export const heures = () => 0;\n");
  assert.equal(sortie.status, 0, sortie.stdout);
  assert.equal(JSON.parse(readFileSync(tasklist, "utf8")).steps[0].contre_preuve.cause, "assertion");
});

test("la cause du rouge se lit sur l'en-tete de l'erreur, jamais dans l'extrait de code", () => {
  const vitestTypeError =
    " FAIL  heures.test.mjs > total\nTypeError: Cannot destructure property 'total' of 'heures(...)' as it is undefined.\n ❯ heures.test.mjs:4:11\n      2| test('total', () => {\n      4|   const { total } = heures([7, 7]);\n      5|   expect(total).toBe(14);\n";
  assert.equal(causeDuRouge(vitestTypeError), "inconnue");
  assert.equal(causeDuRouge(" FAIL  a.test.ts > b\nTypeError: Cannot convert undefined or null to object\n"), "inconnue");
  assert.equal(
    causeDuRouge("  ● calcul › refuse un negatif\n\n    expect(received).toThrow(expected)\n\n    Expected constructor: ErreurMetier\n    Received constructor: TypeError\n\n    Received message: \"(0 , _heures.calcul) is not a function\"\n"),
    "chargement",
  );
  assert.equal(causeDuRouge(" FAIL  heures.test.ts > refus\nAssertionError: expected [Function] to throw error matching /négatif/ but got '__vi_import_0__.calcul is not a function'\n"), "chargement");
  assert.equal(causeDuRouge("    expect(received).toThrow(expected)\n\n    Expected constructor: ErreurMetier\n    Received constructor: RangeError\n    Received message: \"montant négatif\"\n"), "assertion");
  for (const liaison of [
    "TypeError: __vite_ssr_import_0__.Calculateur is not a constructor",
    "AssertionError: expected [Function] to throw error matching /négatif/ but got '__vite_ssr_import_0__.Calculateur is not a constructor'",
    "TypeError: (0 , heures_1.calcul) is not a function",
    "TypeError: (0,__vite_ssr_import_0__.calcul) is not a function",
    "TypeError: (0 , import_heures.calcul) is not a function",
    "TypeError: (0 , heures_1.default) is not a function",
    "TypeError: heures_1.Calculateur is not a constructor",
    "TypeError: import_heures.Calculateur is not a constructor",
    "TypeError: Class extends value undefined is not a constructor or null",
    "RuntimeError: NG0919: Cannot read @Component metadata. This can indicate a runtime circular dependency in your app that needs to be resolved. Find more at https://angular.dev/errors/NG0919",
    "RuntimeError: NG0919: Cannot read @NgModule metadata. This can indicate a runtime circular dependency in your app that needs to be resolved.",
    "Error: Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: undefined. You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.",
  ])
    assert.equal(causeDuRouge(` FAIL  src/heures.test.ts > calcul\n${liaison}\n`), "chargement", liaison);
  for (const execution of ["TypeError: _this.save is not a function", "TypeError: repo.save is not a function", "TypeError: SYNTHESE_2026.map is not a function"])
    assert.equal(causeDuRouge(` FAIL  a.test.ts > b\n${execution}\n ❯ a.test.ts:64:26\n`), "inconnue", execution);
  assert.equal(causeDuRouge(" FAIL  a.test.ts > b\nAssertionError: expected 10 to be 8 // Object.is equality\n ❯ a.test.ts:5:17\n      5|   expect(heures()).toBe(8);\n"), "assertion");
  assert.equal(causeDuRouge("  ● pause › total\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: 8\n    Received: 10\n"), "assertion");
  assert.equal(causeDuRouge("not ok 1 - pause\n  ---\n  error: 'Expected values to be strictly equal'\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n"), "assertion");
  assert.equal(causeDuRouge("    Error: expect(locator).toHaveText(expected) failed\n"), "assertion");
  assert.equal(causeDuRouge("AssertionError [ERR_ASSERTION]: Missing expected exception (TypeError).\n"), "assertion");
  assert.equal(causeDuRouge("Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/x/heures.mjs'\n"), "chargement");
  assert.equal(causeDuRouge("src/a.ts(3,1): error TS2304: Cannot find name 'x'.\n"), "chargement");
  assert.equal(causeDuRouge("Error: fixture introuvable\n"), "inconnue");
  assert.equal(
    causeDuRouge("  ● Reservation › enregistre\n\n    expect(jest.fn()).toHaveBeenCalledWith(...expected)\n\n    Number of calls: 0\n    > 13 |     expect(repo.save).toHaveBeenCalledWith({ id: 1 });\n"),
    "assertion",
  );
  assert.equal(causeDuRouge("    expect(spy).not.toHaveBeenCalledTimes(expected)\n"), "assertion");
  assert.equal(causeDuRouge(" FAIL  a.test.ts > b\nError: Snapshot `b 1` mismatched\n\n- Expected\n+ Received\n"), "assertion");
  assert.equal(causeDuRouge("Error: expected number of assertions to be 2, but got 1\n"), "assertion");
  assert.equal(causeDuRouge("AssertionError: expected 'x' to be 'y'\n- TypeError: attendu dans le stderr\n+ rien\n"), "assertion");
});

test("seul un rouge de chargement bloque : une cause inconnue passe, ecrite et affichee", () => {
  const { racine, tasklist } = depotAvecBase(TEST_DE_LA_REGLE);
  avecCommande(tasklist, "echo 'Error: fixture introuvable'; exit 1");
  const sortie = contrePreuveDe(racine, tasklist);
  assert.equal(sortie.status, 0, sortie.stdout);
  assert.match(sortie.stdout, /rouge de cause inconnue : vérifie qu'il vient de l'assertion de la règle/);
  const lot = JSON.parse(readFileSync(tasklist, "utf8"));
  assert.equal(lot.steps[0].contre_preuve.cause, "inconnue");
  assert.doesNotMatch(griefsDuLivrable(lot, racine).join("\n"), /contre-preuve/);
});

test("hors refactor, un module neuf se gele par son squelette, jamais absent", () => {
  const { racine, tasklist } = lotSansModule("bug");
  const gel = etat(racine, tasklist, "--gel", "S1");
  assert.equal(gel.status, 2, gel.stdout);
  assert.match(gel.stdout, /heures\.mjs n'existe pas : un module neuf se gèle par son squelette exporté/);
  assert.equal(JSON.parse(readFileSync(tasklist, "utf8")).steps[0].avant, undefined);
  const refactor = lotSansModule("refactor");
  assert.equal(etat(refactor.racine, refactor.tasklist, "--gel", "S1").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(refactor.tasklist, "utf8")).steps[0].avant, { "heures.mjs": null });
});

test("sans etat d'avant, ou pour un fichier ajoute apres le gel, la contre-preuve s'arrete sans rien toucher", () => {
  const { racine, tasklist } = depotAvecBase(TEST_DE_LA_REGLE);
  const lot = JSON.parse(readFileSync(tasklist, "utf8"));
  lot.steps[0].prod.push("neuf.mjs");
  writeFileSync(tasklist, JSON.stringify(lot, null, 2));
  const horsDuGel = contrePreuveDe(racine, tasklist);
  assert.equal(horsDuGel.status, 2, horsDuGel.stdout);
  assert.match(horsDuGel.stdout, /neuf\.mjs n'est pas dans l'état d'avant de S1/);
  delete lot.steps[0].avant;
  writeFileSync(tasklist, JSON.stringify(lot, null, 2));
  const sansAvant = contrePreuveDe(racine, tasklist);
  assert.equal(sansAvant.status, 2);
  assert.match(sansAvant.stdout, /S1 n'a pas d'état d'avant : la step se gèle par --gel S1 avant la production/);
  assert.equal(readFileSync(join(racine, "heures.mjs"), "utf8"), "export const heures = () => 8;\n");
});

const TEST_DE_LA_REGLE = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { heures } from './heures.mjs';\ntest('pause', () => assert.equal(heures(), 8));\n";
const TEST_QUI_PASSE_TOUJOURS = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('pause', () => assert.ok(true));\n";

test("la contre-preuve rejoue le test sur la production de base : il rougit, la production revient intacte", () => {
  const { racine, tasklist } = depotAvecBase(TEST_DE_LA_REGLE);
  const sortie = contrePreuveDe(racine, tasklist);
  assert.equal(sortie.status, 0, sortie.stdout + sortie.stderr);
  assert.match(sortie.stdout, /S1 contre-preuve : node --test heures\.test\.mjs → EXIT=1/);
  assert.equal(readFileSync(join(racine, "heures.mjs"), "utf8"), "export const heures = () => 8;\n");
  const step = JSON.parse(readFileSync(tasklist, "utf8")).steps[0];
  assert.equal(step.contre_preuve.exit, 1);
  assert.equal(step.contre_preuve.empreinte, empreinteDeLaStep(step, racine));
});

test("un test qui passe sans le code de la step ne prouve pas la regle", () => {
  const { racine, tasklist } = depotAvecBase(TEST_QUI_PASSE_TOUJOURS);
  const sortie = contrePreuveDe(racine, tasklist);
  assert.equal(sortie.status, 1);
  const lot = JSON.parse(readFileSync(tasklist, "utf8"));
  assert.equal(lot.steps[0].contre_preuve.exit, 0);
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 : la contre-preuve passe sans le code de la step/);
});

const avecCommande = (tasklist, cmd) => {
  const lot = JSON.parse(readFileSync(tasklist, "utf8"));
  lot.steps[0].cmd = cmd;
  writeFileSync(tasklist, JSON.stringify(lot, null, 2));
};

test("une commande verte sur la base mais bavarde n'est pas prise pour un rouge", () => {
  const { racine, tasklist } = depotAvecBase(TEST_DE_LA_REGLE);
  avecCommande(tasklist, "head -c 2000000 /dev/zero; exit 0");
  const sortie = contrePreuveDe(racine, tasklist);
  assert.equal(sortie.status, 1, sortie.stdout + sortie.stderr);
  const lot = JSON.parse(readFileSync(tasklist, "utf8"));
  assert.equal(lot.steps[0].contre_preuve.exit, 0);
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 : la contre-preuve passe sans le code de la step/);
});

test("une commande coupee par un signal n'est pas une contre-preuve", () => {
  const { racine, tasklist } = depotAvecBase(TEST_DE_LA_REGLE);
  avecCommande(tasklist, "kill -TERM $$");
  const sortie = contrePreuveDe(racine, tasklist);
  assert.equal(sortie.status, 2, sortie.stdout + sortie.stderr);
  assert.match(sortie.stdout, /coupée par SIGTERM/);
  assert.equal(JSON.parse(readFileSync(tasklist, "utf8")).steps[0].contre_preuve, undefined);
  assert.equal(readFileSync(join(racine, "heures.mjs"), "utf8"), "export const heures = () => 8;\n");
});

test("la contre-preuve tient sans git : seul bash joue la commande", () => {
  const { racine, tasklist } = depotAvecBase(TEST_DE_LA_REGLE);
  const sansGit = mkdtempSync(join(tmpdir(), "sans-git-"));
  symlinkSync("/bin/bash", join(sansGit, "bash"));
  symlinkSync(process.execPath, join(sansGit, "node"));
  const sortie = spawnSync(process.execPath, [SCRIPT, tasklist, "--contre-preuve", "S1"], { cwd: racine, encoding: "utf8", env: { ...HORS_DU_LANCEUR, PATH: sansGit } });
  assert.equal(sortie.status, 0, sortie.stdout + sortie.stderr);
  assert.match(sortie.stdout, /EXIT=1/);
});

test("changer la commande d'une step apres sa contre-preuve la rend caduque", () => {
  const racine = depot();
  const lot = lotVert(racine);
  lot.steps[0].cmd = "node --test heures.test.mjs";
  lot.steps[0].contre_preuve.empreinte = empreinteDeLaStep(lot.steps[0], racine);
  lot.steps[0].cmd = "true";
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 a bougé depuis sa contre-preuve/);
});

test("une contre-preuve interrompue sans restauration se restaure au prochain appel du juge", () => {
  const { racine, tasklist } = depotAvecBase(TEST_DE_LA_REGLE);
  const sauvegarde = `${tasklist}.restauration.json`;
  writeFileSync(sauvegarde, JSON.stringify([{ chemin: join(racine, "heures.mjs"), actuel: Buffer.from("export const heures = () => 8;\n").toString("base64") }]));
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 10;\n");
  const sortie = spawnSync(process.execPath, [SCRIPT, tasklist], { cwd: racine, encoding: "utf8", env: HORS_DU_LANCEUR });
  assert.match(sortie.stdout, /restauré après une contre-preuve interrompue : .*heures\.mjs/);
  assert.equal(readFileSync(join(racine, "heures.mjs"), "utf8"), "export const heures = () => 8;\n");
  assert.equal(existsSync(sauvegarde), false);
});

test("une step gelee sous la v2, sans etat d'avant, reste jugee sans contre-preuve ; une step gelee par --gel l'exige", () => {
  const racine = depot();
  const lot = lotVert(racine);
  delete lot.steps[0].contre_preuve;
  delete lot.steps[0].avant;
  assert.deepEqual(griefsDuLivrable(lot, racine), []);
  lot.steps[0].avant = { "heures.mjs": null };
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 sans contre-preuve/);
});

test("une step verte sans contre-preuve, ou modifiee depuis, empeche le LIVRÉ", () => {
  const racine = depot();
  const lot = lotVert(racine);
  delete lot.steps[0].contre_preuve;
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 sans contre-preuve/);
  const relance = lotVert(racine);
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 9;\n");
  assert.match(griefsDuLivrable(relance, racine).join("\n"), /S1 a bougé depuis sa contre-preuve/);
});

test("en refactor, la contre-preuve passe sur la base : le test fige l'existant", () => {
  const racine = depot();
  const lot = lotVert(racine, "refactor");
  assert.deepEqual(griefsDuLivrable(lot, racine), []);
  lot.steps[0].contre_preuve.exit = 1;
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 : la contre-preuve rougit sur la base/);
});

test("une step MONEY porte un test de proprietes et un breaker CLEAR sur la step", () => {
  const racine = depot();
  const lot = lotVert(racine);
  const step = lot.steps[0];
  step.risques = ["MONEY"];
  const griefs = griefsDuLivrable(lot, racine).join("\n");
  assert.match(griefs, /S1 MONEY sans test de propriétés/);
  assert.match(griefs, /S1 MONEY sans breaker CLEAR sur la step/);
  writeFileSync(join(racine, "heures.prop.test.mjs"), "test('somme', () => {});\n");
  step.proprietes = "heures.prop.test.mjs :: somme";
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /heures\.prop\.test\.mjs ne contient aucune propriété/);
  writeFileSync(join(racine, "heures.prop.test.mjs"), "import fc from 'fast-check';\ntest('somme', () => fc.assert(fc.property(fc.nat(), (n) => n >= 0)));\n");
  step.contre_preuve.empreinte = empreinteDeLaStep(step, racine);
  step.breaker = { status: "CLEAR", empreinte: empreinteDeLaStep(step, racine) };
  lot.final.breaker.empreinte = empreinteDuLot(lot, racine);
  assert.deepEqual(griefsDuLivrable(lot, racine), []);
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 7;\n");
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 a bougé depuis le CLEAR de son breaker/);
});

test("une step SECURITY ou TENANT exige son breaker, pas de test de proprietes", () => {
  const racine = depot();
  const lot = lotVert(racine);
  lot.steps[0].risques = ["TENANT"];
  const griefs = griefsDuLivrable(lot, racine).join("\n");
  assert.match(griefs, /S1 TENANT sans breaker CLEAR sur la step/);
  assert.doesNotMatch(griefs, /propriétés/);
});

test("--empreinte suivi d'une step imprime l'empreinte de la step", () => {
  const racine = depot();
  const lot = lotVert(racine);
  const chemin = join(racine, "pause.tasklist.json");
  writeFileSync(chemin, JSON.stringify(lot));
  const sortie = spawnSync(process.execPath, [SCRIPT, chemin, "--empreinte", "S1"], { cwd: racine, encoding: "utf8" });
  assert.equal(sortie.stdout.trim(), empreinteDeLaStep(lot.steps[0], racine));
});

test("un lot vert, audité, CLEAR sur son empreinte actuelle est livrable", () => {
  const racine = depot();
  assert.deepEqual(griefsDuLivrable(lotVert(racine), racine), []);
});

test("une step sans preuve ou pas verte empêche le LIVRÉ", () => {
  const racine = depot();
  const lot = lotVert(racine);
  lot.steps.push({ id: "S2", test: "heures.test.mjs :: autre", prod: [], etat: "rouge", sha_test: null, preuve: null });
  lot.steps[0].preuve = null;
  const griefs = griefsDuLivrable(lot, racine).join("\n");
  assert.match(griefs, /S1 vert sans preuve/);
  assert.match(griefs, /S2 rouge/);
});

test("un test modifié après son gel empêche le LIVRÉ", () => {
  const racine = depot();
  const lot = lotVert(racine);
  writeFileSync(join(racine, "heures.test.mjs"), "test('pause', () => { /* assoupli */ });\n");
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /S1 : le test a bougé depuis son gel/);
});

test("le CLEAR du breaker ne vaut que pour l'état du lot qu'il a jugé", () => {
  const racine = depot();
  const lot = lotVert(racine);
  writeFileSync(join(racine, "heures.mjs"), "export const heures = () => 10;\n");
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /le lot a bougé depuis le CLEAR du breaker/);
  lot.final.breaker.status = "COUNTEREXAMPLE";
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /breaker sans CLEAR/);
});

test("sans audit mesuré, pas de LIVRÉ", () => {
  const racine = depot();
  const lot = lotVert(racine);
  lot.final.audit = { shortstat: "1 file changed" };
  assert.match(griefsDuLivrable(lot, racine).join("\n"), /audit incomplet : duplications, jumelles/);
});

test("un audit et un breaker encore nuls se jugent en griefs, sans planter", () => {
  const racine = depot();
  const lot = lotVert(racine);
  lot.final = { audit: null, breaker: null };
  const griefs = griefsDuLivrable(lot, racine).join("\n");
  assert.match(griefs, /audit incomplet : shortstat, duplications, jumelles/);
  assert.match(griefs, /breaker sans CLEAR/);
});

test("une feature exige un contrat validé par l'humain et critiqué CLEAR avant tout", () => {
  const racine = depot();
  const lot = lotVert(racine, "feature");
  const griefs = griefsDuLivrable(lot, racine).join("\n");
  assert.match(griefs, /contrat non validé par l'humain/);
  assert.match(griefs, /contrat non critiqué/);
  lot.contrat.valide = "Tim, 2026-10-27 : « ok »";
  lot.contrat.critique = { status: "CLEAR" };
  assert.deepEqual(griefsDuLivrable(lot, racine), []);
});

test("le juge tient sans git, l'empreinte d'un fichier étant celle de git hash-object", () => {
  const racine = depot();
  const chemin = join(racine, "pause.tasklist.json");
  writeFileSync(chemin, JSON.stringify(lotVert(racine)));
  const script = fileURLToPath(new URL("./etat-du-lot.mjs", import.meta.url));
  const sansGit = spawnSync(process.execPath, [script, chemin], { cwd: racine, encoding: "utf8", env: { PATH: "" } });
  assert.equal(sansGit.stdout, "LIVRABLE\n", sansGit.stderr);
  const gel = spawnSync(process.execPath, [script, chemin, "--gel", "S1"], { cwd: racine, encoding: "utf8", env: { PATH: "" } });
  assert.match(gel.stdout, /S1 gelé : sha_test [0-9a-f]{40}, état d'avant de 1 fichier/, gel.stderr);
  assert.equal(JSON.parse(readFileSync(chemin, "utf8")).steps[0].sha_test, empreinteDe(racine, "heures.test.mjs"));
});

test("la ligne de commande imprime l'empreinte, et sort en 1 sur un lot non livrable", () => {
  const racine = depot();
  const lot = lotVert(racine);
  const chemin = join(racine, "pause.tasklist.json");
  writeFileSync(chemin, JSON.stringify(lot));
  const script = fileURLToPath(new URL("./etat-du-lot.mjs", import.meta.url));
  const empreinte = spawnSync(process.execPath, [script, chemin, "--empreinte"], { cwd: racine, encoding: "utf8" });
  assert.equal(empreinte.stdout.trim(), lot.final.breaker.empreinte);
  assert.equal(spawnSync(process.execPath, [script, chemin], { cwd: racine, encoding: "utf8" }).status, 0);
  lot.steps[0].etat = "rouge";
  writeFileSync(chemin, JSON.stringify(lot));
  const refus = spawnSync(process.execPath, [script, chemin], { cwd: racine, encoding: "utf8" });
  assert.equal(refus.status, 1);
  assert.match(refus.stdout, /S1 rouge/);
});
