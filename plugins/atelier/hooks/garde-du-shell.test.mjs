import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { PROFIL_GENERIQUE, profilDe } from "./depots.mjs";
import { dossierDeLaCommande, ecritureDuShell, reecritureDuShell, refusDuShell } from "./garde-du-shell.mjs";

const RACINE = "/depot";
const SCRATCHPAD = `/private/tmp/claude-${process.getuid()}/-depot/session/scratchpad`;
const IMAGE_DE_LA_CI = "mcr.microsoft.com/playwright:v1.61.1-noble";
const PROFILS = {
  compta: {
    cible:
      "`pnpm -C <paquet> exec vitest run <fichiers>`, `pnpm -C <paquet> exec eslint <fichiers>`, `pnpm turbo run typecheck --filter=<paquet>`, biome sur les fichiers",
    typecheck: "`pnpm turbo run typecheck --filter=<paquet>`, qui construit d'abord les `dist`",
    scriptsCibles: ["test:outillage", "lint:outillage", "e2e"],
    arbrePartage: true,
    baseParSession: true,
    arrierePlanBorne: true,
  },
  boutique: {
    cible:
      "`pnpm --dir apps/web exec vitest run <fichiers>`, `pnpm --filter @boutique/api exec jest <fichiers>` (l'API est sous jest, le web sous vitest), " +
      "`pnpm exec eslint --cache <fichiers>`, `pnpm --filter @boutique/api typecheck` ou `pnpm --dir apps/web typecheck`",
    typecheck: "`pnpm --filter @boutique/api typecheck`, `pnpm --dir apps/web typecheck`, `pnpm typecheck:integration`",
    scriptsCibles: ["test:integration", "typecheck:integration", "e2e:stack", "test:mutation", "lint:inspect"],
    strykerEnPause: true,
    docker: { prefixe: "boutique", compose: "`pnpm docker:dev`, `pnpm docker:tier`, `pnpm stack:prod-local`" },
    migrations: { dossier: "apps/api/src/migrations", scripts: ["test:integration", "docker:tier"] },
    passagesExclusifs: "boutique-tier",
  },
};
const COMPTA = profilDe("compta", PROFILS);
const BOUTIQUE = profilDe("boutique", PROFILS);

const juge = (commande, options = {}) =>
  refusDuShell(commande, {
    racine: RACINE,
    cwd: RACINE,
    profil: PROFIL_GENERIQUE,
    humain: "Tim",
    processus: () => [],
    nonSuivies: () => [],
    imagesDeLaCi: () => [IMAGE_DE_LA_CI],
    ...options,
  });
const passe = (commandes, options) => {
  for (const commande of commandes) assert.equal(juge(commande, options), null, `${commande} a ete refusee a tort`);
};
const refuse = (commandes, motif, options) => {
  for (const commande of commandes) assert.match(juge(commande, options) ?? "", motif, `${commande} a franchi le garde`);
};
const cpt = { profil: COMPTA };
const btq = { profil: BOUTIQUE };
const depotGit = () => {
  const depot = mkdtempSync(join(tmpdir(), "garde-du-shell-"));
  spawnSync("git", ["init", "-q", depot]);
  writeFileSync(join(depot, ".gitignore"), "node_modules/\n");
  return depot;
};

test("les formes ciblees de compta passent", () => {
  passe(
    [
      `LOG=${SCRATCHPAD}/a.log; pnpm -C apps/api exec vitest run src/a.spec.ts > "$LOG" 2>&1; echo "EXIT=$?"; grep -E "🥊|Failed:|Tasks:" "$LOG"`,
      'LOG=$(mktemp); pnpm -C apps/web exec eslint src/a.tsx > "$LOG" 2>&1; echo "EXIT=$?"',
      `PUSH_DEMANDE=1 git push > ${tmpdir()}/push.log 2>&1; echo "EXIT=$?"`,
      "git status --short",
      "git -C /ailleurs diff --stat",
      "git grep -n -w const -- package.json",
      "pnpm turbo run typecheck --filter=@compta/api",
      "pnpm --filter @compta/contracts build",
      "pnpm -C apps/api exec tsc --noEmit -p tsconfig.json",
      "node .gitnexus/run.cjs impact lireLeDossier -r compta 2>/dev/null",
      "( cd apps/api && pnpm exec vitest run src/a.spec.ts )",
      "cd apps/api && pnpm exec vitest run src/a.spec.ts",
      "pnpm --filter @compta/web exec vitest run test/a.test.tsx",
      "bash scripts/test-space.sh list 2>&1 | tail -8",
      'F=$(git diff --name-only); pnpm -C apps/web exec eslint ${=F}',
      'for f in "${F[@]}"; do echo "$f"; done',
      'H=$(grep -rln "export const x" src | head -1); sed -n 1,20p $H',
      'f=$(grep -rl "class Garde" apps/api/src); sed -n 1,40p $f',
      "export POSTGRES_DB=compta_x POSTGRES_SHADOW_DB=compta_x_shadow; pnpm -C apps/api exec vitest run test/a.e2e.spec.ts",
      "POSTGRES_DB=compta_x pnpm -C apps/api exec vitest run test/a.e2e.spec.ts",
      "find . -name '*.ts' -exec stat {} \\;",
      "grep -rn 'a|b' src",
      `rm -rf ${SCRATCHPAD}/vieux`,
      "pnpm biome:format apps/api/src/a.ts",
      "pnpm test:outillage",
      "node --test .claude/hooks/garde-du-shell.test.mjs",
      "git worktree list",
      "git add apps/api/src/neuf.ts",
      "git commit -F msg.txt -- apps/api/src/a.ts",
      "git commit -F msg.txt --pathspec-from-file=liste",
      "git restore --staged a.ts",
    ],
    cpt,
  );
});

test("les formes ciblees de boutique passent", () => {
  passe(
    [
      `LOG=${SCRATCHPAD}/a.log; pnpm --dir apps/web exec vitest run src/app/a.spec.ts > "$LOG" 2>&1; echo "EXIT=$?"`,
      "pnpm --filter @boutique/api exec jest src/a.spec.ts",
      "pnpm --filter @boutique/api exec jest --config ./test/jest-e2e.json test/a.e2e.spec.ts",
      "pnpm exec eslint --cache --cache-location node_modules/.cache/eslint-hook/ apps/web/src/a.ts",
      "pnpm --filter @boutique/api typecheck",
      "pnpm --dir apps/web typecheck",
      "pnpm typecheck:integration",
      "pnpm --dir apps/web build",
      `pnpm test:integration > ${SCRATCHPAD}/i.log 2>&1; echo "EXIT=$?"`,
      `caffeinate -i pnpm test:integration > ${SCRATCHPAD}/i.log 2>&1`,
      "pnpm docker:tier",
      "pnpm e2e:stack",
      "pnpm dup",
      "pnpm dup:tests",
      "pnpm deadcode",
      "pnpm deps:graph",
      "pnpm icons:check",
      "pnpm gate:no-comments-no-documentation",
      "pnpm --dir apps/web exec playwright test e2e/a.spec.ts",
      "pnpm --dir apps/web exec playwright test --config playwright.stack.config.ts",
      "pnpm exec vitest run --config vitest.integration.config.ts",
      "node --test .claude/hooks/garde-du-shell.test.mjs",
      "node .gitnexus/run.cjs impact masquer --repo .",
      "gh pr view 17",
      'F=$(git diff --name-only); pnpm exec eslint ${=F}',
      'for f in "${F[@]}"; do echo "$f"; done',
      "find . -name '*.ts' -exec stat {} \\;",
      `rm -rf ${SCRATCHPAD}/vieux`,
      "git status --short",
      "git stash list",
      "git worktree list",
      "git add apps/api/src/neuf.ts",
      "git commit -F msg.txt -- apps/api/src/neuf.ts",
      "git rm apps/api/src/vieux.ts",
      "git restore --staged a.ts",
      "git checkout -b fix/x",
      "git commit --amend --no-edit -- apps/api/src/neuf.ts",
      "PUSH_DEMANDE=1 git push -u origin fix/x",
    ],
    btq,
  );
});

test("une ecriture de fichier par le shell est refusee", () => {
  refuse(
    ["sed -i '' 's/a/b/' apps/api/src/a.ts", "perl -pi -e 's/a/b/' apps/api/src/a.ts", "awk -i inplace '{print}' a.ts"],
    /modification de fichier par le shell/,
  );
  refuse(
    ["python3 - <<EOF\nprint(1)\nEOF", "node <<'EOF'\nx\nEOF", "bash -s <<EOF\nrm a\nEOF", "cat <<'EOF' | python3\nprint(1)\nEOF"],
    /heredoc qui nourrit un interpréteur/,
  );
  refuse(["cat > a.ts <<'EOF'\nx\nEOF", "echo x > apps/api/src/a.ts", 'echo x > "$LOG"', `echo x > ${SCRATCHPAD}/../../../../../depot/a.ts`], /redirection/);
});

test("un heredoc qui ne nourrit qu'un message ou le scratchpad passe", () => {
  passe([
    "git commit -F - -- a.ts <<EOF\nfeat: x\nEOF",
    'git commit -m "$(cat <<EOF\nfeat: x\nEOF\n)" -- a.ts',
    `cat > ${SCRATCHPAD}/m.txt <<'EOF'\nx\nEOF`,
  ]);
});

test("un refus d'edition nomme la forme sans renvoyer a une section de CLAUDE.md", () => {
  for (const commande of ["sed -i '' 's/a/b/' a.ts", "python3 - <<EOF\nprint(1)\nEOF"]) {
    const refus = juge(commande, cpt) ?? "";
    assert.match(refus, /Read, Edit et Write/);
    assert.doesNotMatch(refus, /CLAUDE\.md/);
  }
  assert.doesNotMatch(juge("DATABASE_URL=postgresql://u:p@h/b pnpm -C apps/api exec prisma migrate deploy", cpt) ?? "", /CLAUDE\.md|Commandes\)/);
});

test("un journal nomme par une variable de boucle ou range sous un chemin ignore reste permis", () => {
  passe([`S=${SCRATCHPAD}; for s in a b; do node x.mjs "$s" > "$S/gn-$s.log" 2>&1; done`]);
  const depot = depotGit();
  assert.equal(juge("pnpm e2e:stack > node_modules/.cache/e2e.log 2>&1", { racine: depot, cwd: depot, profil: BOUTIQUE }), null);
});

test("sous bash, les mots en =, les globs d'option et les listes en variable passent", () => {
  passe([
    "echo =====",
    '[ "$a" == b ]',
    "grep -rn --include=*.ts motif src",
    'F="a.ts b.ts"; pnpm -C apps/web exec eslint $F',
    "F=$(git diff --name-only); for f in $F; do echo $f; done",
  ]);
});

test("git grep -E avec \\b se reecrit en -P, et \\< ou \\> reste refuse", () => {
  assert.equal(reecritureDuShell('git grep -c -E "\\bconst\\b" -- src'), 'git grep -c -P "\\bconst\\b" -- src');
  assert.equal(reecritureDuShell('git grep -nE "\\bx\\b" -- a && git grep -n -w y'), 'git grep -nP "\\bx\\b" -- a && git grep -n -w y');
  assert.equal(reecritureDuShell('git grep --extended-regexp "\\bx"'), 'git grep --perl-regexp "\\bx"');
  assert.equal(reecritureDuShell('git grep -E "a|b" -- src'), null);
  assert.equal(reecritureDuShell('grep -E "\\bx\\b" a.ts'), null);
  refuse(['git grep -E "\\<const\\>" -- src'], /-w/);
});

test("un verdict derriere un pipe passe seulement quand un set -o pipefail le precede", () => {
  passe([
    "set -o pipefail; node --test a.test.mjs 2>&1 | tail -20; echo EXIT=$?",
    "set -euo pipefail; pnpm -C apps/api exec vitest run src/a.spec.ts | tail -20",
  ]);
  refuse(
    [
      "node --test a.test.mjs | tail; echo pipefail",
      "node --test a.test.mjs | tail; set -o pipefail",
      'echo "set -o pipefail"; node --test a.test.mjs | tail',
      "node --test a.test.mjs | tail # set -o pipefail",
      'node --test a.test.mjs 2>&1 | grep -E "^ℹ"; echo "EXIT=${PIPESTATUS[0]}"',
      'node --test a.test.mjs | tail; node --test b.test.mjs | tail; echo "EXIT=${PIPESTATUS[0]}"',
      "node --test a.test.mjs | tail # $PIPESTATUS",
      "node --test a.test.mjs | tail; echo '$PIPESTATUS'",
    ],
    /derrière un pipe/,
  );
});

test("un verdict derriere un pipe ou par xargs est refuse", () => {
  refuse(
    [
      "pnpm -C apps/api exec vitest run src/a.spec.ts | tail -20",
      "PUSH_DEMANDE=1 git push 2>&1 | tail",
      "node --test a.test.mjs | grep ok",
      "pnpm exec prisma migrate diff --script | grep -v x",
      "pnpm deps:graph | tail",
      "pnpm icons:check 2>&1 | head",
      "node scripts/gate-no-literal-colors.mjs | tail",
      "python3 scripts/count-design-debt.py --fail-on-debt | tail",
    ],
    /derrière un pipe/,
  );
  refuse(["git diff --name-only | xargs pnpm -C apps/web exec eslint", "printf '%s' x | xargs eslint"], /xargs/);
});

test("une suite complete hors commit est refusee, en nommant la forme enchainee au commit", () => {
  const compta = [
    "pnpm test",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm run build",
    "pnpm --filter @compta/api test -- porte",
    "pnpm -C apps/web test",
    "pnpm -r typecheck",
    "turbo run test --filter=@compta/web",
    "pnpm turbo run typecheck",
    "pnpm -C apps/api exec vitest run",
    "pnpm -C apps/api exec vitest run --project domaine",
    "pnpm -C apps/web exec eslint .",
    "npx eslint",
    "pnpm biome:format",
    "pnpm exec biome check --write",
  ];
  const boutique = [
    "pnpm test",
    "pnpm lint",
    "pnpm build",
    "pnpm e2e",
    "pnpm test:scripts",
    "pnpm -r --parallel run typecheck",
    "pnpm --filter @boutique/api test",
    "pnpm --filter @boutique/api test:e2e",
    "pnpm --filter @boutique/api test -- src/a.spec.ts",
    "pnpm --dir apps/web test",
    "pnpm --dir apps/web exec vitest run",
    "pnpm --filter @boutique/api exec jest",
    "pnpm --filter @boutique/api exec jest --config ./test/jest-e2e.json",
    "pnpm exec eslint .",
    "pnpm --dir apps/web exec playwright test",
    "cd apps/web && pnpm exec vitest run --coverage",
  ];
  refuse(compta, /suite complète hors commit/, cpt);
  refuse(boutique, /suite complète hors commit/, btq);
  refuse(["pnpm test", "pnpm lint:fix", "pnpm -C apps/api exec jest"], /suite complète hors commit/);
  refuse(
    ["sh .husky/pre-push", "bash ./.husky/pre-commit", ".husky/pre-push", "pnpm exec lefthook run pre-push", "lefthook run pre-commit"],
    /suite complète hors commit/,
    btq,
  );
  passe([`sh .husky/pre-push > ${SCRATCHPAD}/p.log 2>&1 && git commit -F ${SCRATCHPAD}/msg -- a.ts`, "lefthook version"], btq);
  assert.match(juge("pnpm test", cpt) ?? "", /pnpm -C <paquet> exec vitest run/);
  assert.match(juge("pnpm test", btq) ?? "", /exec jest <fichiers>/);
  assert.match(juge("pnpm test") ?? "", /&& git commit -F <msg> -- <chemins>/);
});

test("la suite complete passe quand elle precede un commit par &&", () => {
  const avantCommit = [
    `LOG=${SCRATCHPAD}/s.log; pnpm test > "$LOG" 2>&1 && git commit -F ${SCRATCHPAD}/msg -- apps/api/src/a.ts; echo "EXIT=$?"`,
    `pnpm lint > ${SCRATCHPAD}/l.log 2>&1 && pnpm typecheck > ${SCRATCHPAD}/t.log 2>&1 && git commit -F ${SCRATCHPAD}/msg -- a.ts`,
    `cd apps/web && pnpm exec vitest run > ${SCRATCHPAD}/v.log 2>&1 && git -C /depot commit -F ${SCRATCHPAD}/msg -- a.ts`,
  ];
  passe(avantCommit, cpt);
  passe(avantCommit, btq);
  passe(avantCommit);
  assert.equal(juge(avantCommit[0], { ...cpt, arrierePlan: true }), null);
  refuse(
    [
      `pnpm test > ${SCRATCHPAD}/s.log 2>&1; git commit -F ${SCRATCHPAD}/msg -- a.ts`,
      `pnpm test > ${SCRATCHPAD}/s.log 2>&1 || git commit -F ${SCRATCHPAD}/msg -- a.ts`,
      `git commit -F ${SCRATCHPAD}/msg -- a.ts && pnpm test > ${SCRATCHPAD}/s.log 2>&1`,
    ],
    /suite complète hors commit/,
    cpt,
  );
});

test("seules les commandes plus longues que le plafond partent en arriere-plan, la ou le depot le borne", () => {
  const enFond = (commande, profil = COMPTA) => juge(commande, { profil, arrierePlan: true });
  for (const commande of [
    `PUSH_DEMANDE=1 git push > ${SCRATCHPAD}/push.log 2>&1; echo "EXIT=$?"`,
    `LOG=${SCRATCHPAD}/c.log; git commit -F ${SCRATCHPAD}/msg -- a.ts > "$LOG" 2>&1`,
    "node .gitnexus/run.cjs analyze --index-only 2>/dev/null",
    `pnpm e2e > ${SCRATCHPAD}/e2e.log 2>&1 && git commit -F ${SCRATCHPAD}/msg -- a.ts`,
    `bash scripts/e2e-navigateur.sh --garder -- parcours/a.spec.ts > ${SCRATCHPAD}/e.log 2>&1`,
  ])
    assert.equal(enFond(commande), null, `${commande} a ete refusee a tort`);
  for (const commande of ["sleep 60", `pnpm -C apps/api exec vitest run src/a.spec.ts > ${SCRATCHPAD}/t.log 2>&1`])
    assert.match(enFond(commande) ?? "", /plafond de 600 s/, `${commande} a franchi le garde`);
  assert.equal(enFond(`caffeinate -i pnpm test:integration > ${SCRATCHPAD}/i.log 2>&1`, BOUTIQUE), null);
});

test("la base visee ne se devine pas dans compta", () => {
  refuse(["source apps/api/.env && pnpm -C apps/api exec vitest run a.spec.ts"], /sourcer/, cpt);
  refuse(["POSTGRES_DB=compta_x && pnpm -C apps/api exec vitest run a.spec.ts"], /n'exporte pas/, cpt);
  refuse(["DATABASE_URL=postgresql://u:p@h/b pnpm -C apps/api exec prisma migrate deploy"], /URL/, cpt);
});

test("un binaire hors du depot ou un tsc sans tsconfig est refuse", () => {
  refuse(["npx tsc --noEmit", "npx eslint a.ts", "pnpm exec tsc --noEmit"], /scripts du dépôt/, btq);
  refuse(["npx tsc --noEmit"], /scripts du dépôt/);
  passe(["pnpm exec tsc -p tests/tsconfig.json --noEmit"], btq);
  assert.match(juge("npx tsc --noEmit", cpt) ?? "", /turbo run typecheck/);
});

test("Stryker ne part que sur demande nommee de l'humain, la ou il est en pause", () => {
  refuse(
    ["pnpm --filter @boutique/api test:mutation", "pnpm --dir apps/web exec stryker run", "node scripts/stryker-serial.mjs run"],
    /en pause/,
    btq,
  );
  passe(["STRYKER_DEMANDE=1 pnpm --filter @boutique/api test:mutation"], btq);
  passe(["pnpm --dir apps/web exec stryker run"]);
});

test("les hooks du depot ne se contournent pas", () => {
  refuse(
    [
      "git commit --no-verify -m x",
      "rtk git commit -nm x",
      "PUSH_DEMANDE=1 HUSKY=0 git push",
      "PUSH_DEMANDE=1 SKIP_PRE_PUSH=1 git push",
      "LEFTHOOK=0 git commit -F m -- a.ts",
      "PUSH_DEMANDE=1 LEFTHOOK_SKIP=pre-commit git push",
      "LEFTHOOK_EXCLUDE=dup git commit -F m -- a.ts",
      "git -c core.hooksPath=/dev/null commit -m x",
      "git config core.hooksPath /dev/null",
      "PUSH_DEMANDE=1 git push --no-verify",
    ],
    /ne se contournent jamais/,
  );
  passe(["git commit -F m -- src/user-notifications.ts", "git commit -F m -- apps/a-n.ts", "PUSH_DEMANDE=1 git push -u origin fix/x"]);
});

test("un geste git qui jette du travail ou embarque en masse est refuse partout", () => {
  for (const options of [undefined, cpt, btq])
    refuse(
      [
        "git stash",
        "git stash push -m x",
        "git add -A",
        "git add .",
        "git add 'apps/*.ts'",
        "git -C /ailleurs add -N a.ts",
        "git commit -am x",
        "git restore apps/api/src/a.ts",
        "git checkout -- apps/api/src/a.ts",
        "git checkout main -- apps/api/src/a.ts",
        "git reset --hard HEAD",
        "git clean -fd",
        "git rm --cached apps/api/src/a.ts",
      ],
      /jette du travail/,
      options,
    );
  const hooks = fileURLToPath(new URL(".", import.meta.url));
  assert.match(juge("git add hooks", { cwd: join(hooks, "..") }) ?? "", /jette du travail/);
});

test("sur l'arbre partage, on commite par chemins et l'on supprime par rm", () => {
  refuse(["git commit -m x", "git rm apps/api/src/a.ts"], /arbre partagé/, cpt);
  passe(["git commit -m x -- a.ts", "git rm apps/api/src/a.ts"]);
});

test("une commande qui commence par cd se juge dans le dossier du cd, pas dans celui du shell", () => {
  assert.equal(dossierDeLaCommande("cd /depot/b && pnpm test", "/depot/a"), "/depot/b");
  assert.equal(dossierDeLaCommande("cd ../b; pnpm test", "/depot/a"), "/depot/b");
  assert.equal(dossierDeLaCommande('cd "/depot/b c" && ls', "/depot/a"), "/depot/b c");
  assert.equal(dossierDeLaCommande("pnpm test", "/depot/a"), "/depot/a");
  assert.equal(dossierDeLaCommande("cd $X && pnpm test", "/depot/a"), "/depot/a");
  assert.equal(dossierDeLaCommande("ls && cd /depot/b", "/depot/a"), "/depot/a");
  assert.equal(dossierDeLaCommande("cd ~/depot/b && ls", "/depot/a"), join(homedir(), "depot/b"));
  assert.equal(dossierDeLaCommande("cd - && ls", "/depot/a"), "/depot/a");
});

test("partout, un commit nomme ses chemins : l index entier embarque ce qu une voisine y a pose", () => {
  for (const options of [undefined, cpt, btq]) {
    refuse(["git commit -m x", "git commit -F msg.txt", "git commit --amend --no-edit"], /-- <chemins>/, options);
    passe(["git commit -F msg.txt -- a.ts b.ts", "git commit -F msg.txt --pathspec-from-file=liste"], options);
  }
});

test("aucun worktree sans demande nommee de l'humain", () => {
  for (const options of [undefined, cpt, btq]) refuse(["git worktree add ../compta-b feat/b"], /aucun worktree sans demande/, options);
  passe(["WORKTREE_DEMANDE=1 git worktree add ../compta-b feat/b", "git worktree list"], cpt);
});

test("une ecriture git dont l erreur part dans /dev/null est refusee", () => {
  refuse(
    ["git add a.ts b.ts 2>/dev/null", "git commit -F m.txt &>/dev/null", "git add a.ts >/dev/null 2>&1", "git mv a.ts b.ts 2> /dev/null"],
    /dev\/null/,
  );
  passe(["git add a.ts", "git commit -F m.txt -- a.ts >/dev/null", "git status --short 2>/dev/null"]);
});

test("un processus ne se tue que par son pid, jamais par un motif qui atteint d autres projets", () => {
  refuse(['pkill -f "git push"', "pkill node", "killall node", "pgrep -f vitest | xargs kill"], /pid/);
  passe(["kill 22188", "kill -9 22188 22200", 'pgrep -fl "git push"']);
});

test("un merge ne part que sur demande explicite de l'humain, et jamais par --admin", () => {
  refuse(["gh pr merge 17 --squash", "gh pr merge 17"], /demande explicite de Tim/);
  refuse(["gh pr merge 17 --admin", "MERGE_DEMANDE=1 gh pr merge 17 --squash --admin"], /--admin/);
  passe(["MERGE_DEMANDE=1 gh pr merge 17 --squash", "gh pr view 17"]);
});

test("un push ou un merge prefixe ne passe que si le dernier message de l'humain le demande", () => {
  refuse(["PUSH_DEMANDE=1 git push", "PUSH_DEMANDE=1 gh pr create --fill"], /ne le demande pas/, { demande: "continue le chantier" });
  refuse(["PUSH_DEMANDE=1 git push"], /ne le demande pas/, { demande: "" });
  passe(["PUSH_DEMANDE=1 git push", "PUSH_DEMANDE=1 gh pr create --fill"], { demande: "ok tu peux pousser la branche" });
  passe(["PUSH_DEMANDE=1 git push -u origin x"], { demande: "go commit et push" });
  refuse(
    ["PUSH_DEMANDE=1 git push"],
    /ne le demande pas/,
    { demande: "ne push pas le back, je m'en occuperais, tu ne fait que les commits" },
  );
  refuse(["PUSH_DEMANDE=1 git push"], /ne le demande pas/, { demande: "commite sans pousser" });
  refuse(["PUSH_DEMANDE=1 git push"], /ne le demande pas/, { demande: "pas de push aujourd'hui" });
  refuse(["PUSH_DEMANDE=1 git push"], /ne le demande pas/, { demande: "pas besoin de pousser" });
  refuse(["PUSH_DEMANDE=1 git push"], /ne le demande pas/, { demande: "inutile de pousser ce soir" });
  passe(["PUSH_DEMANDE=1 git push"], { demande: "pousse la branche stp, pas de souci" });
  refuse(["MERGE_DEMANDE=1 gh pr merge 3"], /ne le demande pas/, { demande: "ne merge jamais sans moi" });
  refuse(["MERGE_DEMANDE=1 gh pr merge 3 --squash"], /ne le demande pas/, { demande: "pousse la branche" });
  passe(["MERGE_DEMANDE=1 gh pr merge 3 --squash"], { demande: "tu peux merger la PR 3" });
});

test("un push ou une PR ne part que sur demande explicite de l'humain", () => {
  refuse(["git push", "git push origin feat/x", "git -C ../depot push -u origin x", "gh pr create --fill"], /Tim pousse/);
  passe(["PUSH_DEMANDE=1 git push", "PUSH_DEMANDE=1 gh pr create --fill", "git fetch", "git rev-parse HEAD @{u}"]);
});

test("les refus nomment celui que les reglages designent", () => {
  assert.match(juge("git push", { humain: "Élodie" }) ?? "", /Élodie pousse ou valide/);
  assert.match(juge("gh pr merge 3", { humain: "Élodie" }) ?? "", /demande explicite d'Élodie|demande explicite de Élodie/);
  assert.match(juge("git worktree add ../b feat/b", { humain: "Élodie" }) ?? "", /Élodie le demande/);
});

test("publier ou rendre public vaut une demande de push, sauf nie", () => {
  passe(["PUSH_DEMANDE=1 git push -u origin main"], { demande: "ok go, peux tu finaliser tout et le rendre publique ?" });
  passe(["PUSH_DEMANDE=1 gh pr create --fill"], { demande: "publie la branche" });
  refuse(["PUSH_DEMANDE=1 git push"], /ne le demande pas/, { demande: "ne publie pas encore" });
  refuse(["PUSH_DEMANDE=1 git push"], /ne le demande pas/, { demande: "la route publique renvoie 500, corrige-la sans publier" });
});

test("la VM Docker partagee ne se purge jamais, et boutique ne touche que ses conteneurs", () => {
  for (const options of [undefined, cpt, btq])
    refuse(
      [
        "docker volume prune -f",
        "docker volume rm compta_pg",
        "docker volume rm boutique_pg",
        "docker system prune -af",
        "docker image prune -a",
        "docker container prune -f",
        "docker system prune --volumes",
        "docker compose --project-name boutique-dev -f docker-compose.dev.yml down -v",
        "docker compose down --volumes",
      ],
      /VM Docker est partagée/,
      options,
    );
  refuse(
    ["docker stop compta-postgres", "docker rm -f $(docker ps -aq)", "docker container rm compta-api", "docker rmi postgres:17"],
    /VM Docker est partagée/,
    btq,
  );
  refuse(
    [
      "docker run --rm projectdiscovery/nuclei -u https://boutique.fr",
      "docker run -d -p 5433:5432 --name boutique-pg postgres:17",
      "docker run --rm -i mcr.microsoft.com/playwright:v1.50.0-noble bash",
    ],
    /compose du dépôt/,
    btq,
  );
  passe(
    [
      "docker compose --project-name boutique-dev --env-file .env.dev -f docker-compose.dev.yml ps",
      "docker compose --project-name boutique-dev -f docker-compose.dev.yml down",
      "docker stop boutique-dev-api-1",
      "docker builder prune -f",
      "docker image prune -f",
      "docker system df",
      "docker run --rm boutique-web:local node -v",
      `docker run --rm -i -e CI=1 -w /work ${IMAGE_DE_LA_CI} bash -c 'tar -xf - && pnpm install --frozen-lockfile'`,
    ],
    btq,
  );
  passe(["docker stop compta-postgres", "docker run --rm postgres:17 psql --version"], cpt);
});

test("l'image de la CI se lit dans ci.yml", () => {
  const depot = depotGit();
  spawnSync("mkdir", ["-p", join(depot, ".github/workflows")]);
  writeFileSync(join(depot, ".github/workflows/ci.yml"), `jobs:\n  visuels:\n    container: ${IMAGE_DE_LA_CI}\n`);
  const avecLaVraieCi = { racine: depot, cwd: depot, profil: BOUTIQUE, imagesDeLaCi: undefined };
  assert.equal(juge(`docker run --rm -i ${IMAGE_DE_LA_CI} node -v`, avecLaVraieCi), null);
  assert.match(juge("docker run --rm -i node:24-bookworm node -v", avecLaVraieCi) ?? "", /compose du dépôt/);
});

test("un secret ne finit pas dans la sortie", () => {
  refuse(
    [
      "cat .env.dev",
      "head -5 .env",
      "tail apps/api/.env.prod",
      "cat secrets/jwt_secret.txt",
      "docker compose --project-name boutique-dev --env-file .env.dev -f docker-compose.dev.yml config",
      "docker compose config | grep PORT",
    ],
    /secret/,
  );
  passe([
    "grep -E '^MAILPIT_WEB_PORT=' .env.dev",
    "cat .env.dev.example",
    "cut -d= -f1 .env.dev",
    "docker compose -f docker-compose.dev.yml config --services",
    "docker compose -f docker-compose.dev.yml config -q",
    `docker compose -f docker-compose.dev.yml config > ${SCRATCHPAD}/compose.yml`,
  ]);
});

test("un passage de tests ne se lance pas par-dessus un autre du depot, la ou les passages sont exclusifs", () => {
  const enCours = { profil: BOUTIQUE, processus: () => [`4242 node ${RACINE}/node_modules/.pnpm/vitest@4/node_modules/vitest/vitest.mjs run --coverage`] };
  refuse(
    [
      "pnpm test:integration",
      "PUSH_DEMANDE=1 git push",
      "pnpm --dir apps/web exec vitest run src/a.spec.ts",
      "pnpm e2e:stack",
      `pnpm test > ${SCRATCHPAD}/s.log 2>&1 && git commit -F ${SCRATCHPAD}/msg -- a.ts`,
    ],
    /tourne déjà \(pid 4242\)/,
    enCours,
  );
  refuse(["pnpm docker:tier"], /tourne déjà/, {
    profil: BOUTIQUE,
    processus: () => ["77 docker compose --project-name boutique-tier --profile tier run -T --rm --build schema-tier"],
  });
  passe(["pnpm --dir apps/web exec vitest run src/a.spec.ts", "git status"], {
    profil: BOUTIQUE,
    processus: () => ["99 node /ailleurs/compta/node_modules/vitest/vitest.mjs run"],
  });
  passe(["git status --short", "pnpm deps:graph"], enCours);
  passe(["pnpm -C apps/api exec vitest run src/a.spec.ts"], { ...enCours, profil: COMPTA });
});

test("le tier ne part pas avec une migration hors index", () => {
  const horsIndex = { profil: BOUTIQUE, nonSuivies: () => ["apps/api/src/migrations/1788000000037-x.ts"] };
  refuse(["pnpm test:integration", "pnpm docker:tier"], /compte les migrations/, horsIndex);
  passe(["pnpm --dir apps/web exec vitest run src/a.spec.ts"], horsIndex);
});

test("le hook lit le depot du dossier de travail et refuse par exit 2", () => {
  const script = fileURLToPath(new URL("./garde-du-shell.mjs", import.meta.url));
  const appel = (cwd, command) =>
    spawnSync(process.execPath, [script], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", cwd, tool_input: { command } }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    });
  const depot = depotGit();
  assert.equal(appel(depot, "git status --short").status, 0);
  const refus = appel(depot, "pnpm test");
  assert.equal(refus.status, 2);
  assert.match(refus.stderr, /\[garde-du-shell\] refus : suite complète hors commit/);
  assert.equal(appel(depot, "git rm a.ts").status, 0);
  const reecrite = appel(depot, 'git grep -n -E "\\bx\\b" -- .');
  assert.equal(reecrite.status, 0);
  const { hookSpecificOutput } = JSON.parse(reecrite.stdout);
  assert.equal(hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(hookSpecificOutput.permissionDecision, undefined);
  assert.equal(hookSpecificOutput.updatedInput.command, 'git grep -n -P "\\bx\\b" -- .');
});

test("ecritureDuShell laisse lire et jouer un test cible, et nomme toute ecriture", () => {
  for (const commande of [
    `LOG=${SCRATCHPAD}/b.log; pnpm -C apps/api exec vitest run src/a.spec.ts > "$LOG" 2>&1; echo "EXIT=$?"`,
    "git diff -- apps/api/src/a.ts",
    "git log -1 --format=%H -- a.ts",
    "git show HEAD:a.ts",
    "git grep -n -w taux -- apps",
    "cat apps/api/src/a.ts",
    "rg -n taux apps",
    "pnpm --filter @boutique/api exec jest src/a.spec.ts",
    "node --test scripts/a.test.mjs",
    "pnpm exec eslint apps/a.ts",
  ])
    assert.equal(ecritureDuShell(commande), null, `${commande} a ete refusee a tort`);
  for (const commande of [
    "echo x > apps/api/src/a.ts",
    "pnpm e2e > node_modules/.cache/e.log 2>&1",
    "cat a.ts | tee b.ts",
    "rm apps/api/src/a.ts",
    "mv a.ts b.ts",
    "cp a.ts b.ts",
    "touch a.ts",
    "sed -i '' 's/a/b/' a.ts",
    "git commit -F m -- a.ts",
    "git add a.ts",
    "git stash",
    "git reset --hard",
    "git checkout -b x",
    "PUSH_DEMANDE=1 git push",
    "pnpm install",
    "pnpm add left-pad",
    "pnpm exec eslint --fix apps/a.ts",
    "pnpm exec biome check --write apps/a.ts",
    "pnpm -C apps/web exec vitest run -u src/a.spec.ts",
    "cat > a.ts <<'EOF'\nx\nEOF",
  ])
    assert.notEqual(ecritureDuShell(commande), null, `${commande} a franchi le garde`);
});
