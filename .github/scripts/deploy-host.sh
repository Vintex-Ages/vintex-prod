#!/usr/bin/env bash
# Executado como root NA EC2, via SSM Run Command (ver deploy-release.mjs). Segue o
# procedimento de back-end/documentation/docs/infraestrutura/aws-staging-runtime.md:
# release em pasta nova, guard reinstalado e deploy_staging.py com rollback embutido.
# As variáveis abaixo são exportadas por deploy-release.mjs antes deste conteúdo.
set -euo pipefail

: "${SHA:?}" "${DEPLOY_BUCKET:?}" "${DEPLOY_REGION:?}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-scripts/infra/deploy_staging.py}"
STATE_CONFIG="${STATE_CONFIG:-/etc/vintex/staging.json}"
VENV_PYTHON="${VENV_PYTHON:-/opt/vintex/deploy-venv/bin/python}"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "SHA inválido"; exit 1; }
test "$(id -u)" -eq 0 || { echo "Precisa rodar como root"; exit 1; }

DIR="/opt/vintex/releases/$SHA"
SRC="s3://$DEPLOY_BUCKET/releases/$SHA"

if [ -e "$DIR/.complete" ]; then
  echo "Release $SHA já extraída no host; reutilizando sem sobrescrever."
elif [ -e "$DIR" ]; then
  echo "Release $SHA existe mas está incompleta: remova $DIR manualmente e repita." >&2
  exit 1
else
  # Extrai numa pasta temporária e só então renomeia: falha no download não deixa
  # uma release incompleta com o nome do SHA travando o próximo deploy.
  TMP="$(mktemp -d "/opt/vintex/releases/.partial-${SHA}-XXXXXX")"
  trap 'rm -rf "$TMP"' EXIT
  install -d -m 0755 "$TMP/frontend"
  aws s3 cp --region "$DEPLOY_REGION" "$SRC/back-end.tar.gz" - | tar -xz -C "$TMP" --no-same-owner
  aws s3 cp --region "$DEPLOY_REGION" "$SRC/front-end.tar.gz" - | tar -xz -C "$TMP/frontend" --no-same-owner
  find "$TMP" -type d -exec chmod 0755 {} +
  find "$TMP" -type f -exec chmod 0644 {} +
  touch "$TMP/.complete"
  mv -T "$TMP" "$DIR"
  trap - EXIT
fi

test -f "$DIR/frontend/index.html" || { echo "frontend/index.html ausente"; exit 1; }
test -f "$DIR/$DEPLOY_SCRIPT" || { echo "$DEPLOY_SCRIPT ausente no release"; exit 1; }

# O deploy reaplica o guard instalado em /usr/local/sbin: instalar o do release novo antes.
bash "$DIR/infra/aws/staging/install-guard.sh"

# Atualiza só os campos do release; preserva os demais e mantém backup datado.
STATE_CONFIG="$STATE_CONFIG" DIR="$DIR" SHA="$SHA" python3 - <<'PY'
import json, os, shutil, time

path = os.environ["STATE_CONFIG"]
shutil.copy2(path, f"{path}.bak-{int(time.time())}")
with open(path) as handle:
    config = json.load(handle)
config["sha"] = os.environ["SHA"]
config["runtime_dir"] = f"{os.environ['DIR']}/infra/aws/staging"
config["frontend_dir"] = f"{os.environ['DIR']}/frontend"
with open(path, "w") as handle:
    json.dump(config, handle, indent=2)
    handle.write("\n")
PY

"$VENV_PYTHON" "$DIR/$DEPLOY_SCRIPT" --config "$STATE_CONFIG"
