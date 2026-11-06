#!/usr/bin/env bash
set -euo pipefail

bash "$(dirname "$0")/../fixture.sh"
mkdir -p .lots
cat > .lots/pause.tasklist.json <<'JSON'
{
  "lot": "pause",
  "mode": "bug",
  "contrat": { "must": ["une journée de 9h à 17h vend 8 heures", "la pause de midi ne compte pas"] },
  "steps": [
    { "id": "S1", "must": "une journée de 9h à 17h vend 8 heures", "test": "test/heures.test.mjs :: une journée de 9h à 17h vend 8 heures", "prod": ["src/heures.mjs"], "etat": "vert", "preuve": "ROUGE 0 != 8 · VERT node --test test/heures.test.mjs → EXIT=0" },
    { "id": "S2", "must": "la pause de midi ne compte pas", "test": "test/pause.test.mjs :: 9h–12h puis 14h–19h vend 8 heures", "prod": ["src/heures.mjs"], "etat": "todo" }
  ]
}
JSON
