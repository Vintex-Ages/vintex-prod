#!/usr/bin/env bash
# Popula a staging com o catálogo sintético e as duas contas de demo.
# Roda na EC2 (root) depois do deploy. Idempotente.
#
# Senhas: Parameter Store, SecureString, criadas por você uma única vez:
#   /vintex/staging/demo_buyer_password
#   /vintex/staging/demo_seller_password
# (ou exporte DEMO_BUYER_PASSWORD / DEMO_SELLER_PASSWORD para pular a AWS).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
api="$(docker ps -q \
  --filter label=com.docker.compose.project=vintex-staging \
  --filter label=com.docker.compose.service=api | head -1)"
[[ -n "$api" ]] || { echo "Contêiner da API não encontrado (a staging está de pé?)." >&2; exit 1; }

get_param() {
  aws ssm get-parameter --region us-east-2 --name "/vintex/staging/$1" \
    --with-decryption --query Parameter.Value --output text
}
DEMO_BUYER_PASSWORD="${DEMO_BUYER_PASSWORD:-$(get_param demo_buyer_password)}"
DEMO_SELLER_PASSWORD="${DEMO_SELLER_PASSWORD:-$(get_param demo_seller_password)}"
export DEMO_BUYER_PASSWORD DEMO_SELLER_PASSWORD

# Catálogo sintético do próprio repositório (lojas e peças), se ainda não existir.
docker exec "$api" python -m app.seeds.lojas
docker exec "$api" python -m app.seeds.pecas

# Contas de demo pela API, de dentro do contêiner: o cadastro público segue fechado.
docker exec -i -e DEMO_BUYER_PASSWORD -e DEMO_SELLER_PASSWORD "$api" python - < "$here/seed_demo.py"
