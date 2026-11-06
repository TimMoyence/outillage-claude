import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deplacer.mjs");

const ecrire = (racine, fichiers) => {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
};

export const depot = (suivis, horsSuivi = {}) => {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "ranger-")));
  const git = (...args) => spawnSync("git", ["-C", racine, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@ranger.local");
  git("config", "user.name", "ranger");
  ecrire(racine, { ".gitignore": "/node_modules\n", "package.json": "{}\n", "node_modules/.garde": "", ...suivis });
  git("add", "-A");
  git("commit", "-qm", "base");
  ecrire(racine, horsSuivi);
  return racine;
};

export const ranger = (racine, plan, ...options) => {
  writeFileSync(join(racine, "..", `${racine.split("/").pop()}.plan.json`), JSON.stringify(plan));
  const sortie = spawnSync("node", [SCRIPT, join(racine, "..", `${racine.split("/").pop()}.plan.json`), ...options], { cwd: racine, encoding: "utf8" });
  return { code: sortie.status, texte: `${sortie.stdout}${sortie.stderr}` };
};

export const contenus = (racine, chemins) =>
  Object.fromEntries(chemins.map((chemin) => [chemin, existsSync(join(racine, chemin)) ? readFileSync(join(racine, chemin), "utf8") : null]));

export const statutGit = (racine) => spawnSync("git", ["-C", racine, "status", "--porcelain"], { encoding: "utf8" }).stdout;
