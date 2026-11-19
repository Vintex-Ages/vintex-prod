#!/usr/bin/env bash
# Zera o banco da staging e repovoa. Use ao ligar o dia (ou sob demanda).
# Destrutivo: apaga TODOS os dados do banco. Exige --yes.
#
# As mudanças feitas durante o dia não persistem: este script devolve o ambiente
# ao estado inicial. Mudanças que devem durar são feitas pela AWS/Terraform.
set -euo pipefail

[[ "${1:-}" == "--yes" ]] || { echo "Isto apaga todos os dados da staging. Rode com --yes para confirmar." >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
api="$(docker ps -q \
  --filter label=com.docker.compose.project=vintex-staging \
  --filter label=com.docker.compose.service=api | head -1)"
[[ -n "$api" ]] || { echo "Contêiner da API não encontrado." >&2; exit 1; }

docker exec "$api" alembic downgrade base
docker exec "$api" alembic upgrade head
"$here/seed-demo.sh"
echo "Staging redefinida."
