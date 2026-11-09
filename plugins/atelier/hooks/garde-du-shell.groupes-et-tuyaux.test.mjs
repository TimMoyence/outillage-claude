import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · un cd dans un groupe { } en tête de tuyau ou en fond ne déplace rien, en dernier maillon il rend le dossier illisible", () => {
  const hors = mkdtempSync(join(tmpdir(), "garde-hors-"));
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const commande of [
    `{ cd ${seul}; } | cat; git rm a.md`,
    `{ cd ${seul} && git status; } 2>&1 | tail -5; git rm a.md`,
    `{ cd ${seul}; } & git rm a.md`,
    `{ cd ${seul}; } |& cat; git rm a.md`,
  ])
    assert.equal(depuis(partage, commande), refusDuPartage, `${commande} a franchi le garde`);
  for (const commande of [`{ cd ${partage}; } && git rm a.md`, `{ cd ${partage} && git rm a.md; } | cat`])
    assert.equal(depuis(hors, commande), refusDuPartage, `${commande} a franchi le garde`);
  assert.equal(depuis(partage, `{ cd ${seul}; }; git rm a.md`), null);
  for (const commande of [`ls | { cd ${seul}; }; git rm a.md`, `ls |& cd ${seul}; git rm a.md`, `ls |\ncd ${seul}; git rm a.md`])
    assert.match(depuis(partage, commande) ?? "", /^le dossier où ce git s'exécute ne se lit pas/, `${commande} a franchi le garde`);
});
