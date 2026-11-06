#!/usr/bin/env bash
# Aplica os rulesets do vintex-prod. Exige permissão de admin no repositório.
# Uso: bash config/governance/rulesets/apply.sh [--dry-run]
set -euo pipefail
repo="Vintex-Ages/vintex-prod"
dir="$(cd "$(dirname "$0")" && pwd)"
old_id=21583895 # "develop/main/deploy governance" (0 aprovações), substituído pelos três abaixo

for file in develop qa-main deploy; do
  name=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['name'])" "$dir/$file.json")
  if [ "${1:-}" = "--dry-run" ]; then echo "criaria: $name"; continue; fi
  existing=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name==\"$name\") | .id")
  if [ -n "$existing" ]; then
    gh api -X PUT "repos/$repo/rulesets/$existing" --input "$dir/$file.json" --silent
    echo "atualizado: $name ($existing)"
  else
    gh api -X POST "repos/$repo/rulesets" --input "$dir/$file.json" --silent
    echo "criado: $name"
  fi
done

if [ "${1:-}" != "--dry-run" ]; then
  gh api -X DELETE "repos/$repo/rulesets/$old_id" --silent && echo "removido: ruleset antigo $old_id"
fi
