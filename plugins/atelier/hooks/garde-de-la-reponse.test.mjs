import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { empreinteDeLaStep, empreinteDuLot } from "../skills/livrer/scripts/etat-du-lot.mjs";
import { rappelDeCloture, refusDeLaReponse, refusDuLivre } from "./garde-de-la-reponse.mjs";

const depotLivre = () => {
  const racine = mkdtempSync(join(tmpdir(), "livre-"));
  spawnSync("git", ["init", "-q", racine]);
  writeFileSync(join(racine, "a.mjs"), "export const a = 1;\n");
  writeFileSync(join(racine, "a.test.mjs"), "test('a', () => {});\n");
  const shaTest = spawnSync("git", ["-C", racine, "hash-object", "a.test.mjs"], { encoding: "utf8" }).stdout.trim();
  const lot = {
    lot: "a",
    mode: "bug",
    contrat: {},
    carte: { prod: ["a.mjs"], tests: ["a.test.mjs"] },
    steps: [{ id: "S1", test: "a.test.mjs :: a", prod: ["a.mjs"], etat: "vert", sha_test: shaTest, preuve: "ROUGE · VERT EXIT=0" }],
    final: { audit: { shortstat: "1 file", duplications: "0", jumelles: "aucune" }, breaker: { status: "CLEAR" } },
  };
  lot.steps[0].contre_preuve = { exit: 1, cause: "assertion", empreinte: empreinteDeLaStep(lot.steps[0], racine) };
  lot.final.breaker.empreinte = empreinteDuLot(lot, racine);
  const tasklist = join(racine, "..", `${racine.split("/").pop()}-a.tasklist.json`);
  writeFileSync(tasklist, JSON.stringify(lot));
  return { racine, tasklist, lot };
};
const rapportLivre = (tasklist) => `Verdict    : LIVRÉ\nSteps      : S1 → EXIT=0\nJSON       : \`${tasklist}\``;

const passe = (messages) => {
  for (const message of messages) assert.equal(refusDeLaReponse(message), null, `${message} a ete refuse a tort`);
};
const refuse = (messages, motif) => {
  for (const message of messages) assert.match(refusDeLaReponse(message) ?? "", motif, `${message} a franchi le garde`);
};

test("un rapport qui cite une question, une URL ou du code passe", () => {
  passe([
    "Le lot est vert : 23 tests passent, eslint rend 0.",
    "Le lot est poussé : pre-push vert, 23 tests ajoutés, eslint rend 0.",
    "Tim a demandé « pourquoi le total diverge ? » : la marge omettait l'intérim.",
    "La route `GET /dossiers?exercice=2025` rend 200.",
    "```ts\nconst x = a ? b : c;\n```\nCorrigé dans `apps/api/src/a.ts:12`.",
    "> Est-ce juste ?\n\nOui : le classeur donne 12 400 €.",
    "Le seuil est improbablement bas pour un mot comme lotissement.",
    "Deux causes, à savoir le cache et la base.",
    "`pnpm test:integration` est lancé en fond (≈ 50 min, caffeinate) ; je rapporte à sa fin.",
  ]);
});

test("une question, une offre ou une attente en prose est refusee", () => {
  refuse(["On commite ?", "Je pousse maintenant ?\n\nLe reste est vert."], /question en prose/);
  refuse(
    [
      "Veux-tu que je lance le pre-push.",
      "Je peux aussi ouvrir la PR.",
      "Dis-moi si ça te va.",
      "Dites-moi si ça vous va.",
      "J'attends la fin du passage 4.",
      "J'attends ton feu vert.",
      "Le merge vous revient.",
      "La relance Linux est de votre côté.",
    ],
    /offre ou une attente/,
  );
});

test("un seau de reste est refuse", () => {
  refuse(
    [
      "Points ouverts : la vue mensuelle.",
      "C'est hors lot.",
      "C'est hors périmètre.",
      "Restent rouges : deux specs, préexistantes.",
      "Limites connues : le plan des pistes.",
      "Points à trancher : la largeur du sélecteur.",
      "Écarts à connaître : aucun.",
      "Le test est flaky sous charge.",
      "On le traitera dans un second temps.",
      "Le lot est vert.\n\nÀ savoir : le bundle pèse 1,2 Mo.",
      "Le lot est vert.\n\n**À savoir**\n- le bundle pèse 1,2 Mo.",
    ],
    /seau de reste/,
  );
});

test("un report a plus tard est refuse, pas la phrase qui dit ce que la suite n'aura pas a refaire", () => {
  refuse(["On le reprendra dans une prochaine session.", "Je le ferai lors d'une prochaine PR.", "À voir à la prochaine passe."], /seau de reste/);
  passe(["Tes choix sont enregistrés, pour qu'une prochaine session ne te les redemande pas."]);
});

test("le refus nomme celui que les reglages designent", () => {
  assert.match(refusDeLaReponse("On commite ?", undefined, "Élodie") ?? "", /question à Élodie/);
});

test("le refus demande la reponse entiere, pour que la reponse finale ne perde rien de ce qui etait etabli", () => {
  const refus = refusDeLaReponse("Le lot est vert.\n\nOn commite ?") ?? "";
  assert.match(refus, /Réécris la réponse entière, sans ces formes/);
  assert.doesNotMatch(refus, /Réécris la fin/);
});

test("un rouge range chez une autre session ou avant le lot est refuse", () => {
  refuse(
    [
      "**Ce qui reste, hors de mes lots** - `dup:prod` relève un clone dans `apps/web`.",
      "**Ce qui reste rouge, et ne vient pas de mes changements** - Six fichiers de test web échouent.",
      "Les rouges qui restent ne viennent pas de mes changements.",
      "Le lint casse à cause d'une règle neuve d'une autre session : ce n'est pas dans mon diff.",
      "**Ce qui reste rouge et n'est pas à moi.** La voisine retire les libellés.",
      "Seuls les deux tests étaient à moi ; les six autres sont à d'autres sessions.",
      "La plupart existaient avant ce lot et relèvent de M2.web.",
      "Deux specs échouent sur le travail de la session voisine.",
      "Le typecheck rougit sur un fichier d'une autre session.",
      "Un rouge préexistant sur `a.spec.ts`.",
      "Ce rouge est pré-existant.",
      "Deux specs échouent sur le travail de la session voisine. Je n'ai rien corrigé.",
      "Le typecheck rougit sur un fichier d'une autre session, pas encore corrigé.",
    ],
    /rouge rangé/,
  );
  passe([
    "Un fichier tenu par une session voisine se relit juste avant l'édition.",
    "Le commit embarque les hunks de la session voisine dans `a.ts`, nommés dans le message.",
    "Je n'ai touché que mes lignes dans les six fichiers tenus par la voisine.",
    "Le rouge de la session voisine est corrigé : `a.spec.ts` passe, 12 sur 12.",
    "Le rouge venait de mon propre lot : corrigé dans `a.ts:3`.",
    "**1. Un test rouge dans un fichier modifié hier par une autre session.**\nJe le corrige dans mon lot.",
    "1. **Test rouge dans un fichier d'une autre session** : je le corrige dans mon lot, après relecture.",
  ]);
});

test("seul le rouge d'un fichier tenu par une voisine active se laisse, cite par son chemin", () => {
  const tenu = (citation) => citation === "apps/web/a.spec.ts:12";
  const laisse = "Deux specs échouent dans `apps/web/a.spec.ts:12`, tenu par une session voisine active : je n'y touche pas.";
  assert.equal(refusDeLaReponse(laisse, tenu), null);
  assert.match(refusDeLaReponse(laisse) ?? "", /rouge rangé/);
  assert.match(refusDeLaReponse(`${laisse}\n\nUn rouge préexistant sur \`b.ts\`.`, tenu) ?? "", /rouge rangé/);
  assert.match(refusDeLaReponse("`apps/web/a.spec.ts:12` échoue chez la voisine ; je peux aussi le corriger.", tenu) ?? "", /offre ou une attente/);
});

test("une affirmation non mesuree est refusee", () => {
  refuse(
    [
      "La cause est probablement le cache.",
      "La branche est sans doute la même chose en plus abouti.",
      "Ça devrait passer au push.",
    ],
    /non mesurée/,
  );
});

test("tout tour qui a ecrit du code rappelle l'audit, sans exiger de commit", () => {
  const rappel = rappelDeCloture(["/depot/apps/api/src/a.ts"], false);
  for (const etape of [
    /audite et revalide le code produit/,
    /KISS\/DRY/,
    /responsabilités claires/,
    /front et back/,
    /routes précisément typés/,
    /duplications sémantiques/,
    /normalisation de l'AST/,
    /calculs et leurs gardes/,
    /cas limites des fonctions nouvelles/,
    /contrôles pertinents/,
    /limites restantes/,
    /task lists entièrement terminées/,
    /ni commit/,
  ])
    assert.match(rappel, etape);
  assert.doesNotMatch(rappel, /pnpm dup:ast/);
  assert.match(rappelDeCloture(["/depot/apps/api/src/a.ts"], true), /`pnpm dup:ast`/);
});

test("ni une lecture ni une ecriture hors code ne rappellent l'audit", () => {
  assert.equal(rappelDeCloture([], false), null);
  assert.equal(rappelDeCloture(["/depot/README.md", "/depot/docs/a.md"], false), null);
});

const script = fileURLToPath(new URL("./garde-de-la-reponse.mjs", import.meta.url));
const finDeTour = (entree, env = {}) =>
  spawnSync(process.execPath, [script], { input: JSON.stringify(entree), encoding: "utf8", env: { ...process.env, ...env } });

test("une relance deja refusee passe, la suivante est jugee de nouveau", () => {
  const session = `test-${randomUUID()}`;
  const fin = (stopHookActive) => finDeTour({ session_id: session, stop_hook_active: stopHookActive, last_assistant_message: "On commite ?" });
  assert.equal(fin(false).status, 2);
  assert.equal(fin(true).status, 0);
  assert.equal(fin(true).status, 2);
  assert.equal(fin(true).status, 0);
});

const transcrire = (transcription, ecrits) =>
  writeFileSync(
    transcription,
    [
      { type: "user", message: { content: "corrige" } },
      ...ecrits.map((chemin) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: chemin } }] } })),
    ]
      .map((ligne) => JSON.stringify(ligne))
      .join("\n"),
  );

test("le rouge d'un fichier ecrit par une voisine active se laisse, pas celui d'une voisine eteinte ni celui de la session", () => {
  const depot = mkdtempSync(join(tmpdir(), "garde-de-la-reponse-"));
  const projets = join(depot, "projets");
  mkdirSync(join(projets, "moi"), { recursive: true });
  mkdirSync(join(projets, "voisine"));
  const moi = join(projets, "moi", "session.jsonl");
  const voisine = join(projets, "voisine", "session.jsonl");
  const fichier = join(depot, "src/a.ts");
  const fin = () =>
    finDeTour(
      { session_id: `test-${randomUUID()}`, cwd: depot, transcript_path: moi, last_assistant_message: "`src/a.ts:3` échoue chez la session voisine, qui y travaille : je n'y touche pas." },
      { CLAUDE_PROJECT_DIR: depot },
    );
  transcrire(moi, []);
  transcrire(voisine, [fichier]);
  assert.equal(fin().status, 0);
  const ilYaDeuxHeures = new Date(Date.now() - 2 * 60 * 60 * 1000);
  utimesSync(voisine, ilYaDeuxHeures, ilYaDeuxHeures);
  assert.match(fin().stderr, /rouge rangé/);
  transcrire(voisine, [fichier]);
  transcrire(moi, [fichier]);
  assert.match(fin().stderr, /rouge rangé/);
});

test("un LIVRÉ n'existe que sur une task list livrable", () => {
  const { racine, tasklist, lot } = depotLivre();
  assert.equal(refusDuLivre("Le lot est vert : 4 tests passent.", racine), null);
  assert.equal(refusDuLivre(rapportLivre(tasklist), racine), null);
  assert.match(refusDuLivre("Verdict    : LIVRÉ\nSteps : S1", racine) ?? "", /LIVRÉ sans task list/);
  lot.steps[0].etat = "rouge";
  writeFileSync(tasklist, JSON.stringify(lot));
  assert.match(refusDuLivre(rapportLivre(tasklist), racine) ?? "", /S1 rouge/);
});

test("le hook refuse un LIVRÉ non livrable, et ne rappelle pas l'audit sur un LIVRÉ livrable", () => {
  const { racine, tasklist, lot } = depotLivre();
  const transcription = join(racine, "session.jsonl");
  transcrire(transcription, [join(racine, "a.mjs")]);
  const fin = () =>
    finDeTour(
      { session_id: `test-${randomUUID()}`, cwd: racine, transcript_path: transcription, last_assistant_message: rapportLivre(tasklist) },
      { CLAUDE_PROJECT_DIR: racine },
    );
  writeFileSync(join(racine, "a.mjs"), "export const a = 2;\n");
  const refus = fin();
  assert.equal(refus.status, 2);
  assert.match(refus.stderr, /le lot a bougé depuis le CLEAR du breaker/);
  assert.doesNotMatch(refus.stderr, /audite et revalide/);
  lot.steps[0].contre_preuve.empreinte = empreinteDeLaStep(lot.steps[0], racine);
  lot.final.breaker.empreinte = empreinteDuLot(lot, racine);
  writeFileSync(tasklist, JSON.stringify(lot));
  assert.equal(fin().status, 0);
});

test("un LIVRÉ accepté supprime sa task list, un LIVRÉ refusé la garde", () => {
  const { racine, tasklist } = depotLivre();
  const transcription = join(racine, "session.jsonl");
  transcrire(transcription, []);
  const fin = (message) =>
    finDeTour({ session_id: `test-${randomUUID()}`, cwd: racine, transcript_path: transcription, last_assistant_message: message }, { CLAUDE_PROJECT_DIR: racine });
  assert.equal(fin(`${rapportLivre(tasklist)}\n\nOn commite ?`).status, 2);
  assert.equal(existsSync(tasklist), true);
  assert.equal(fin(rapportLivre(tasklist)).status, 0);
  assert.equal(existsSync(tasklist), false);
});

test("une relance apres refus juge encore le LIVRÉ et supprime sa task list s'il est livrable", () => {
  const { racine, tasklist, lot } = depotLivre();
  const transcription = join(racine, "session.jsonl");
  transcrire(transcription, []);
  const session = `test-${randomUUID()}`;
  const fin = (message, stopHookActive) =>
    finDeTour({ session_id: session, cwd: racine, transcript_path: transcription, stop_hook_active: stopHookActive, last_assistant_message: message }, { CLAUDE_PROJECT_DIR: racine });
  assert.equal(fin("On commite ?", false).status, 2);
  lot.steps[0].etat = "rouge";
  writeFileSync(tasklist, JSON.stringify(lot));
  const relance = fin(rapportLivre(tasklist), true);
  assert.equal(relance.status, 2);
  assert.match(relance.stderr, /S1 rouge/);
  lot.steps[0].etat = "vert";
  writeFileSync(tasklist, JSON.stringify(lot));
  assert.equal(fin(rapportLivre(tasklist), true).status, 0);
  assert.equal(existsSync(tasklist), false);
});

test("sous livrer, la passe finale tient l'audit et le rappel de clôture se tait", () => {
  const depot = mkdtempSync(join(tmpdir(), "garde-de-la-reponse-"));
  const transcription = join(depot, "session.jsonl");
  const lignes = [
    { type: "user", message: { content: "<command-message>atelier:livrer</command-message>\n<command-name>/atelier:livrer</command-name>" } },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: join(depot, "src/a.ts") } }] } },
  ];
  writeFileSync(transcription, lignes.map((ligne) => JSON.stringify(ligne)).join("\n"));
  const fin = finDeTour(
    { session_id: `test-${randomUUID()}`, cwd: depot, transcript_path: transcription, last_assistant_message: "S2 est verte : 4 tests passent, EXIT=0." },
    { CLAUDE_PROJECT_DIR: depot },
  );
  assert.equal(fin.status, 0, fin.stderr);
});

test("le hook lit les ecritures du tour dans la transcription, et ne rappelle pas l'audit sur une relance", () => {
  const depot = mkdtempSync(join(tmpdir(), "garde-de-la-reponse-"));
  writeFileSync(join(depot, "package.json"), JSON.stringify({ scripts: { "dup:ast": "node scripts/dup-ast.mjs" } }));
  const transcription = join(depot, "session.jsonl");
  const ecrire = (chemin) => transcrire(transcription, [chemin]);
  const fin = (stopHookActive) =>
    finDeTour(
      { session_id: `test-${randomUUID()}`, cwd: depot, transcript_path: transcription, stop_hook_active: stopHookActive, last_assistant_message: "Le lot est vert : 4 tests passent." },
      { CLAUDE_PROJECT_DIR: depot },
    );
  ecrire(join(depot, "src/a.ts"));
  const bloque = fin(false);
  assert.equal(bloque.status, 2);
  assert.match(bloque.stderr, /audite et revalide/);
  assert.match(bloque.stderr, /`pnpm dup:ast`/);
  assert.equal(fin(true).status, 0);
  ecrire("/ailleurs/src/a.ts");
  assert.equal(fin(false).status, 0);
});
