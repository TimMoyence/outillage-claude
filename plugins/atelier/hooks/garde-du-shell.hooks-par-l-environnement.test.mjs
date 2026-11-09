import assert from "node:assert/strict";
import { test } from "node:test";

import { juge, passe } from "./essais-de-la-garde.mjs";

test("LEC-2.2 · une variable de saut exportée, GIT_CONFIG_* ou la section core réécrite ne contournent pas les hooks", () => {
  const refusDesHooks = juge("git -c core.hooksPath=/dev/null commit -F m -- a.ts");
  assert.notEqual(refusDesHooks, null);
  passe([
    "SKIP=lent node --test a.test.mjs",
    "export PATH=/opt/bin:$PATH; git status",
    "git config --get-regexp core",
    "git config --rename-section alias vieux",
    "git grep -n -e --no-verify",
  ]);
  for (const commande of [
    "HUSKY=0; git commit -F m -- a.ts",
    "export HUSKY=0; git commit -F m -- a.ts",
    "export HUSKY; git commit -F m -- a.ts",
    "declare -x HUSKY=0; git commit -F m -- a.ts",
    "typeset -x LEFTHOOK=0; git commit -F m -- a.ts",
    "SKIP=gitleaks,credo git commit -F m -- a.ex",
    "export SKIP=credo; git commit -F m -- a.ex",
    "SKIP=gitleaks PUSH_DEMANDE=1 git push",
    `GIT_CONFIG_PARAMETERS="'core.hooksPath=/dev/null'" git commit -F m -- a.ts`,
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -F m -- a.ts",
    "GIT_CONFIG_GLOBAL=/dev/null git commit -F m -- a.ts",
    `export GIT_CONFIG_PARAMETERS="'core.hooksPath=/dev/null'"; git commit -F m -- a.ts`,
    "git config --remove-section core",
    "git config --rename-section core vieux",
    "git config remove-section CORE",
    "git config rename-section vieux core",
    "git merge --no-verify feat/x",
    "git rebase --no-verify main",
    "git am --no-verify a.patch",
  ])
    assert.equal(juge(commande), refusDesHooks, `${commande} a franchi le garde`);
});
