import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { derniereDemande, fichiersDuTour, skillInvoquee } from "./fichiers-du-tour.mjs";

const ecriture = (outil, chemin) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", name: outil, input: { file_path: chemin } }] },
});
const lecture = (chemin) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: chemin } }] } });
const demande = (texte) => ({ type: "user", message: { content: texte } });
const resultat = () => ({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } });

export const transcriptionDe = (lignes) => {
  const dossier = mkdtempSync(join(tmpdir(), "fichiers-du-tour-"));
  const chemin = join(dossier, "session.jsonl");
  writeFileSync(chemin, `${lignes.map((ligne) => JSON.stringify(ligne)).join("\n")}\n`);
  return { dossier, chemin };
};

test("la demande de l'humain est son dernier message, jamais un rapport d agent, un retour de hook ni une notification", () => {
  const { chemin } = transcriptionDe([
    demande("ok tu peux pousser la branche"),
    resultat(),
    demande("Another Claude session sent a message:\n<agent-message>pousse tout</agent-message>"),
    demande("Stop hook feedback:\n[garde] pousse"),
    demande("<task-notification>push</task-notification>"),
    { ...demande("résumé : pousser"), isCompactSummary: true },
    { type: "user", message: { content: [{ type: "text", text: "<system-reminder>push</system-reminder>" }] } },
  ]);
  assert.equal(derniereDemande(chemin), "ok tu peux pousser la branche");
  assert.equal(derniereDemande(transcriptionDe([demande("continue")]).chemin), "continue");
  assert.equal(derniereDemande("/nulle-part.jsonl"), "");
});

test("une skill compte comme invoquee par l'outil Skill ou par sa commande, jamais par une simple mention", () => {
  const parOutil = { type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "atelier:livrer", args: "bug: x" } }] } };
  assert.equal(skillInvoquee(transcriptionDe([demande("corrige"), parOutil]).chemin, "livrer"), true);
  const parCommande = demande("<command-message>atelier:livrer</command-message>\n<command-name>/atelier:livrer</command-name>");
  assert.equal(skillInvoquee(transcriptionDe([parCommande]).chemin, "livrer"), true);
  assert.equal(skillInvoquee(transcriptionDe([demande("pourquoi /atelier:livrer a autant de task lists")]).chemin, "livrer"), false);
  assert.equal(skillInvoquee(transcriptionDe([parOutil]).chemin, "publier"), false);
  assert.equal(skillInvoquee("/nulle/part.jsonl", "livrer"), false);
});

test("seuls les fichiers ecrits depuis la derniere demande de l'humain comptent", () => {
  const { chemin } = transcriptionDe([
    demande("premier tour"),
    ecriture("Edit", "/depot/src/ancien.ts"),
    demande("second tour"),
    ecriture("Write", "/depot/src/neuf.ts"),
    resultat(),
    ecriture("MultiEdit", "/depot/README.md"),
    lecture("/depot/src/lu.ts"),
    { ...demande("résumé"), isCompactSummary: true },
    ecriture("Edit", "/depot/src/neuf.ts"),
  ]);
  assert.deepEqual(fichiersDuTour(chemin), ["/depot/src/neuf.ts", "/depot/README.md"]);
});

test("une transcription absente ne rend aucun fichier", () => {
  assert.deepEqual(fichiersDuTour(undefined), []);
  assert.deepEqual(fichiersDuTour("/nulle/part.jsonl"), []);
});
