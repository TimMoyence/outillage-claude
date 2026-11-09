import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERIFIER = join(dirname(fileURLToPath(import.meta.url)), "verifier.mjs");

function verifierUnCarnetQuiCite(citation) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "verif-")));
  const depot = join(base, "depot_de_test");
  mkdirSync(join(depot, "src"), { recursive: true });
  writeFileSync(join(depot, "src", "a.ts"), "");
  mkdirSync(join(base, "voisin"));
  writeFileSync(join(base, "voisin", "doc.md"), "");
  const projet = depot.replace(/[^A-Za-z0-9]/g, "-");
  const carnet = join(base, "home", ".claude", "projects", projet, "memory");
  mkdirSync(carnet, { recursive: true });
  writeFileSync(join(carnet, "MEMORY.md"), "→ [fiche](fiche.md)\n");
  writeFileSync(join(carnet, "fiche.md"), `---\nname: fiche\ndescription: "une fiche"\ntype: reference\n---\n\n- cite ${citation}.\n`);
  const sortie = spawnSync(process.execPath, [VERIFIER, projet], { env: { ...process.env, HOME: join(base, "home") }, encoding: "utf8" });
  return { code: sortie.status, texte: sortie.stdout + sortie.stderr };
}

test("un chemin cité depuis le parent du dépôt se résout", () => {
  const { code, texte } = verifierUnCarnetQuiCite("`../voisin/doc.md`");
  assert.equal(code, 0, texte);
});

test("un dépôt dont le nom porte un tiret bas se retrouve", () => {
  const { code, texte } = verifierUnCarnetQuiCite("`src/a.ts`");
  assert.equal(code, 0, texte);
});

test("un chemin qui n'existe nulle part reste refusé", () => {
  const { code, texte } = verifierUnCarnetQuiCite("`src/absent.ts`");
  assert.equal(code, 1);
  assert.match(texte, /CHEMIN ABSENT dans fiche\.md : src\/absent\.ts/);
});

test("un numéro de ligne sans dossier est refusé", () => {
  const { code, texte } = verifierUnCarnetQuiCite("`a.ts:31`");
  assert.equal(code, 1);
  assert.match(texte, /NUMÉRO DE LIGNE dans fiche\.md : a\.ts:31/);
});
