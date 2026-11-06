import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { refusDuBreaker } from "./garde-du-breaker.mjs";

const PRODUCTION = "apps/api/src/features/noyau/domain/taux.ts";
const SCRATCHPAD = `/private/tmp/claude-${process.getuid()}/-depot/session/scratchpad`;
const BREAKER = "atelier:breaker";

test("hors du breaker, la garde laisse tout passer", () => {
  for (const agent of [undefined, "Explore", "general-purpose", "breaker-de-test"])
    assert.equal(refusDuBreaker(agent, "Write", { file_path: PRODUCTION }), null, `${agent} a ete bloque a tort`);
});

test("le breaker lit et joue un test cible par Bash", () => {
  for (const command of [
    `git diff -- ${PRODUCTION}`,
    "git grep -n -w taux -- apps",
    `LOG=${SCRATCHPAD}/b.log; pnpm -C apps/api exec vitest run src/features/noyau/domain/taux.spec.ts > "$LOG" 2>&1; echo "EXIT=$?"`,
    `cat ${PRODUCTION}`,
  ])
    assert.equal(refusDuBreaker(BREAKER, "Bash", { command }), null, `${command} a ete refusee a tort`);
  for (const outil of ["Read", "Grep", "Glob"]) assert.equal(refusDuBreaker(BREAKER, outil, { file_path: PRODUCTION }), null);
  assert.equal(refusDuBreaker("breaker", "Bash", { command: "git status --short" }), null);
});

test("le breaker n'ecrit rien, ni par un outil d'edition ni par le shell", () => {
  for (const outil of ["Edit", "Write", "MultiEdit", "NotebookEdit"])
    assert.match(refusDuBreaker(BREAKER, outil, { file_path: "apps/web/test/ecran.test.tsx" }) ?? "", /n'écrit rien/, `${outil} a franchi le garde`);
  for (const command of [`echo x > ${PRODUCTION}`, "git commit -F m -- a.ts", "git stash", "rm a.ts", "sed -i '' 's/a/b/' a.ts", "pnpm exec eslint --fix a.ts"])
    assert.match(refusDuBreaker("breaker", "Bash", { command }) ?? "", /lecture seule/, `${command} a franchi le garde`);
});

test("le hook refuse par exit 2, et seulement dans le breaker", () => {
  const script = fileURLToPath(new URL("./garde-du-breaker.mjs", import.meta.url));
  const appel = (entree) => spawnSync(process.execPath, [script], { input: JSON.stringify(entree), encoding: "utf8" });
  assert.equal(appel({ agent_type: BREAKER, tool_name: "Bash", tool_input: { command: "git status --short" } }).status, 0);
  assert.equal(appel({ agent_type: BREAKER, tool_name: "Bash", tool_input: { command: "git add a.ts" } }).status, 2);
  assert.equal(appel({ agent_type: BREAKER, tool_name: "Write", tool_input: { file_path: "a.test.ts" } }).status, 2);
  assert.equal(appel({ tool_name: "Write", tool_input: { file_path: "a.test.ts" } }).status, 0);
});
