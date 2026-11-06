import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { depot, ranger, statutGit } from "./depot-de-test.mjs";

const FICHIERS = {
  "src/a.ts": "export const a = 1;\n",
  "src/b.ts": "export const b = 1;\n",
  "src/vieux/v.ts": "export const v = 1;\n",
  "src/core/c.ts": "export const c = 1;\n",
  "src/donnees/source.ts": "export const m = __dirname + '/../migrations';\nexport const ok = join(__dirname, '..');\n",
  "scripts/t.mjs": "const D = 'src/vieux';\n",
  "eslint.config.js": "export default [{ files: ['src/core/**/*.ts'] }];\n",
};

const REFUS = [
  ["une source absente", { deplacements: { "src/absent.ts": "src/y.ts" } }, "source absente : src/absent.ts"],
  ["une destination occupée", { deplacements: { "src/a.ts": "src/b.ts" } }, "destination occupée : src/b.ts"],
  ["deux sources vers une destination", { deplacements: { "src/a.ts": "src/z.ts", "src/b.ts": "src/z.ts" } }, "deux sources vers src/z.ts : src/a.ts, src/b.ts"],
  ["un dossier qui disparaît sans être déclaré", { deplacements: { "src/vieux/v.ts": "src/neuf/v.ts" } }, "scripts/t.mjs:1 désigne src/vieux, qui disparaît : déclare-le dans plan.dossiers"],
  [
    "__dirname hors forme reconnue dans un fichier déplacé",
    { deplacements: { "src/donnees/source.ts": "src/donnees/brut/source.ts" } },
    "src/donnees/source.ts:1 construit un chemin depuis __dirname hors d'une forme reconnue : écris join(__dirname, '<chemin>') ou déclare le texte dans plan.reecritures",
  ],
  [
    "un glob dont l'ensemble change",
    { deplacements: { "src/core/c.ts": "src/autre/c.ts" } },
    "eslint.config.js:1 le glob src/core/**/*.ts change (sortants : src/core/c.ts ; entrants : aucun) : réécris-le par plan.reecritures ou accepte-le par plan.globs_acceptes « eslint.config.js → src/core/**/*.ts »",
  ],
  ["un remplacement déclaré qui ne trouve rien", { deplacements: {}, reecritures: { "eslint.config.js": { "src/absent/**": "src/x/**" } } }, "eslint.config.js : le remplacement « src/absent/** » ne trouve rien"],
];

for (const [cas, plan, cause] of REFUS) {
  test(`RNG-03 · ${cas} est refusé avec sa cause, et rien ne bouge`, () => {
    const racine = depot(FICHIERS);
    const sortie = ranger(racine, plan);
    assert.deepEqual({ code: sortie.code, cause: sortie.texte.includes(cause), statut: statutGit(racine) }, { code: 1, cause: true, statut: "" }, sortie.texte);
  });
}

test("RNG-03 · sans node_modules à côté d'un package.json, rien ne bouge", () => {
  const racine = depot(FICHIERS);
  rmSync(join(racine, "node_modules"), { recursive: true });
  const sortie = ranger(racine, { deplacements: { "src/a.ts": "src/z.ts" } });
  assert.deepEqual(
    { code: sortie.code, cause: sortie.texte.includes("node_modules absent : installe les dépendances avant de ranger"), statut: statutGit(racine) },
    { code: 1, cause: true, statut: "" },
  );
});

test("RNG-03 · un glob réécrit qui rétablit l'ensemble, ou accepté par sa clé fichier → glob d'après la réécriture, passe", () => {
  const reecrit = depot(FICHIERS);
  const parReecriture = ranger(reecrit, {
    deplacements: { "src/core/c.ts": "src/autre/c.ts" },
    reecritures: { "eslint.config.js": { "src/core/**/*.ts": "src/autre/**/*.ts" } },
  });
  const accepte = depot(FICHIERS);
  const parAcceptation = ranger(accepte, {
    deplacements: { "src/core/c.ts": "src/autre/c.ts" },
    reecritures: { "eslint.config.js": { "src/core/**/*.ts": "src/coeur/**/*.ts" } },
    globs_acceptes: ["eslint.config.js → src/coeur/**/*.ts"],
  });
  assert.deepEqual([parReecriture.code, parAcceptation.code], [0, 0], `${parReecriture.texte}${parAcceptation.texte}`);
});
