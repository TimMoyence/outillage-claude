#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ecritureDuShell } from "./garde-du-shell.mjs";

const BREAKER = /(^|:)breaker$/;
const OUTILS_QUI_ECRIVENT = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

export const refusDuBreaker = (agent, outil, entree) => {
  if (!BREAKER.test(agent ?? "")) return null;
  if (OUTILS_QUI_ECRIVENT.has(outil))
    return "le breaker n'écrit rien : un contre-exemple se rapporte (fichier, cas, attendu) et la session qui l'a dépêché l'écrit.";
  if (outil !== "Bash") return null;
  const ecriture = ecritureDuShell(String(entree.command ?? ""));
  return ecriture === null
    ? null
    : `le breaker est en lecture seule : Bash sert à lire et à jouer un test ciblé, jamais à écrire (${ecriture}). ` +
        'Un journal va dans le scratchpad : `LOG=<scratchpad>/x.log; <commande> > "$LOG" 2>&1; echo "EXIT=$?"`.';
};

function juger() {
  try {
    const entree = JSON.parse(readFileSync(0, "utf8"));
    const refus = refusDuBreaker(entree.agent_type, entree.tool_name, entree.tool_input ?? {});
    if (refus === null) return;
    process.stderr.write(`[garde-du-breaker] refus : ${refus}\n`);
    process.exitCode = 2;
  } catch (panne) {
    process.stderr.write(`[garde-du-breaker] refus : entrée illisible (${panne})\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  juger();
}
