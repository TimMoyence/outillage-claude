#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { depotDe } from "./depots.mjs";
import { fichiersDuTour, transcriptionDe } from "./fichiers-du-tour.mjs";

const EXTENSIONS_JUGEES = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const brute = readFileSync(0, "utf8");
const entree = JSON.parse(brute || "{}");
const { racine } = depotDe(entree.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const juge = join(racine, ".claude/hooks/fin-de-tour.sh");
const fichiers = existsSync(juge)
  ? fichiersDuTour(transcriptionDe(entree)).filter((chemin) => chemin.startsWith(`${racine}/`) && EXTENSIONS_JUGEES.test(chemin) && existsSync(chemin))
  : [];

if (fichiers.length > 0) {
  const verdict = spawnSync("bash", [juge], {
    input: brute,
    encoding: "utf8",
    cwd: racine,
    env: { ...process.env, TOUR_FICHIERS: fichiers.join("\n") },
  });
  process.stderr.write(verdict.stderr ?? "");
  process.exitCode = verdict.status === 2 ? 2 : 0;
}
