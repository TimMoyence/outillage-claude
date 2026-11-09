import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { depotGit, jugeDepuis } from "./essais-de-la-garde.mjs";

test("LEC-4.7 · une continuation de ligne ne cache ni le git ni le cd qui la suivent, et >| n'est pas un tuyau", () => {
  const hors = mkdtempSync(join(tmpdir(), "garde-hors-"));
  const partage = depotGit({ "a.md": "a\n" });
  const seul = depotGit({ "a.md": "a\n" });
  const depuis = jugeDepuis(partage);
  const refusDuPartage = depuis(partage, "git rm a.md");
  assert.notEqual(refusDuPartage, null);

  for (const [cwd, commande] of [
    [partage, "true && \\\n  git rm a.md"],
    [partage, "ls \\\n  -la; git rm a.md"],
    [hors, `cd ${partage} && \\\n  git rm a.md`],
    [hors, `{ cd ${partage}; } >| /dev/null; git rm a.md`],
  ])
    assert.equal(depuis(cwd, commande), refusDuPartage, `${commande} a franchi le garde`);
  assert.equal(depuis(partage, `cd ${seul} \\\n  && git rm a.md`), null);
});
