import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./fin-de-tour.mjs", import.meta.url));

const ecriture = (chemin) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: chemin } }] } });
const demande = { type: "user", message: { content: "tour" } };

const depot = ({ juge }) => {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "fin-de-tour-")));
  spawnSync("git", ["init", "-q", racine]);
  if (juge) {
    mkdirSync(join(racine, ".claude/hooks"), { recursive: true });
    writeFileSync(join(racine, ".claude/hooks/fin-de-tour.sh"), 'cat > /dev/null; printf "%s" "$TOUR_FICHIERS" >&2; exit 2\n');
  }
  writeFileSync(join(racine, "a.ts"), "");
  writeFileSync(join(racine, "b.md"), "");
  return racine;
};

const tour = (racine, ecrits) => {
  const transcription = join(racine, "session.jsonl");
  writeFileSync(transcription, [demande, ...ecrits.map(ecriture)].map((ligne) => JSON.stringify(ligne)).join("\n"));
  return spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify({ transcript_path: transcription, cwd: racine }), encoding: "utf8" });
};

test("le juge du depot recoit les seuls fichiers JS ou TS existants que le tour a ecrits sous la racine", () => {
  const racine = depot({ juge: true });
  const sortie = tour(racine, [join(racine, "a.ts"), join(racine, "absent.ts"), join(racine, "b.md"), "/ailleurs/c.ts"]);
  assert.equal(sortie.status, 2);
  assert.equal(sortie.stderr, join(racine, "a.ts"));
});

test("sans fichier jugeable ou sans juge dans le depot, la fin de tour passe", () => {
  const avecJuge = depot({ juge: true });
  assert.equal(tour(avecJuge, [join(avecJuge, "b.md")]).status, 0);
  const sansJuge = depot({ juge: false });
  assert.equal(tour(sansJuge, [join(sansJuge, "a.ts")]).status, 0);
});
