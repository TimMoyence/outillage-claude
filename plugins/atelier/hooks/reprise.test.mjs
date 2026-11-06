import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { contexteDeReprise } from "./reprise.mjs";

const SCRIPT = fileURLToPath(new URL("./reprise.mjs", import.meta.url));

const depot = () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "reprise-")));
  const racine = join(parent, "compta");
  mkdirSync(racine);
  spawnSync("git", ["init", "-q", racine]);
  return { parent, racine };
};

const tasklist = (parent, slug, lot) => writeFileSync(join(parent, `compta-${slug}.tasklist.json`), JSON.stringify(lot));

test("sans task list du depot, seule la personne qui decide est nommee", () => {
  const { racine } = depot();
  assert.equal(contexteDeReprise(racine, "compta", "Tim"), "Tim est l'humain qui décide du produit et valide push, PR et merge.");
  assert.equal(contexteDeReprise(racine, null, "Tim"), "Tim est l'humain qui décide du produit et valide push, PR et merge.");
});

test("chaque task list du depot se reinjecte avec sa phase et sa prochaine step", () => {
  const { parent, racine } = depot();
  tasklist(parent, "pause", {
    lot: "pause",
    mode: "bug",
    steps: [
      { id: "S1", must: "la pause se déduit", etat: "vert" },
      { id: "S2", must: "un refus nomme sa cause", etat: "rouge" },
    ],
  });
  tasklist(parent, "export", { lot: "export", mode: "feature", contrat: { valide: null }, steps: [] });
  tasklist(parent, "fini", { lot: "fini", mode: "bug", steps: [{ id: "S1", etat: "vert" }] });
  writeFileSync(join(parent, "autre-depot-x.tasklist.json"), JSON.stringify({ lot: "x", steps: [] }));
  const contexte = contexteDeReprise(racine, "compta");
  assert.match(contexte, /compta-pause\.tasklist\.json · lot pause \(bug\) · boucle · prochaine step S2 rouge : un refus nomme sa cause/);
  assert.match(contexte, /compta-export\.tasklist\.json · lot export \(feature\) · cadrage : contrat à valider puis à critiquer/);
  assert.match(contexte, /compta-fini\.tasklist\.json · lot fini \(bug\) · passe finale/);
  assert.doesNotMatch(contexte, /autre-depot/);
});

test("les task lists d'un depot voisin au nom plus long ne se melangent pas", () => {
  const { parent, racine } = depot();
  mkdirSync(join(parent, "compta-admin"));
  tasklist(parent, "pause", { lot: "pause", mode: "bug", steps: [{ id: "S1", must: "m", etat: "todo" }] });
  writeFileSync(join(parent, "compta-admin-export.tasklist.json"), JSON.stringify({ lot: "export", mode: "bug", steps: [] }));
  const contexte = contexteDeReprise(racine, "compta", "Tim");
  assert.match(contexte, /lot pause/);
  assert.doesNotMatch(contexte, /compta-admin-export/);
});

test("le champ depot de la task list tranche quand le nom de fichier est ambigu", () => {
  const { parent, racine } = depot();
  mkdirSync(join(parent, "compta-v2"));
  writeFileSync(join(parent, "compta-v2-export.tasklist.json"), JSON.stringify({ lot: "v2-export", depot: "compta", mode: "bug", steps: [] }));
  writeFileSync(join(parent, "compta-v2-import.tasklist.json"), JSON.stringify({ lot: "import", depot: "compta-v2", mode: "bug", steps: [] }));
  const contexte = contexteDeReprise(racine, "compta", "Tim");
  assert.match(contexte, /lot v2-export/);
  assert.doesNotMatch(contexte, /lot import/);
});

test("le dossier de task lists que nomme .claude/livrer.md se lit aussi", () => {
  const { racine } = depot();
  mkdirSync(join(racine, ".claude"));
  mkdirSync(join(racine, ".lots"));
  writeFileSync(join(racine, ".claude", "livrer.md"), "# livrer\n\n- Task list : dans `./.lots/` à la racine du dépôt.\n- Commande ciblée : `node --test <fichier>`.\n");
  writeFileSync(join(racine, ".lots", "pause.tasklist.json"), JSON.stringify({ lot: "pause", mode: "bug", steps: [{ id: "S1", must: "m", etat: "todo" }] }));
  assert.match(contexteDeReprise(racine, "compta", "Tim"), /\.lots\/pause\.tasklist\.json · lot pause \(bug\) · boucle · prochaine step S1 todo : m/);
});

test("le hook cree les reglages a la premiere conversation et reinjecte par additionalContext", () => {
  const { parent, racine } = depot();
  tasklist(parent, "pause", { lot: "pause", mode: "bug", steps: [{ id: "S1", must: "m", etat: "todo" }] });
  const donnees = join(parent, "donnees");
  const sortie = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ source: "compact", cwd: racine }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_DATA: donnees },
  });
  assert.equal(sortie.status, 0, sortie.stderr);
  assert.equal(existsSync(join(donnees, "atelier.json")), true);
  const { hookSpecificOutput } = JSON.parse(sortie.stdout);
  assert.equal(hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(hookSpecificOutput.additionalContext, /prochaine step S1 todo : m/);
});

test("hors de tout depot, le hook nomme seulement la personne des reglages", () => {
  const ailleurs = mkdtempSync(join(tmpdir(), "reprise-ailleurs-"));
  const donnees = join(ailleurs, "donnees");
  mkdirSync(donnees);
  writeFileSync(join(donnees, "atelier.json"), JSON.stringify({ humain: "Élodie", profils: {} }));
  const sortie = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ source: "startup", cwd: ailleurs }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_DATA: donnees },
  });
  assert.equal(sortie.status, 0);
  assert.equal(JSON.parse(sortie.stdout).hookSpecificOutput.additionalContext, "Élodie est l'humain qui décide du produit et valide push, PR et merge.");
});
