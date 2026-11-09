# E2E do Vintex

Suíte de ponta a ponta com Playwright: navegador real, front-end real e API
real. Não há mock de rede no app — o front roda com `VITE_USE_MOCKS=false` e a
IA usa um provider determinístico do back-end.

## Jornadas cobertas

| Spec | O que prova |
|---|---|
| `smoke` | visitante: home → catálogo → peça, busca textual, guarda de rota (desktop e WebKit/iPhone) |
| `vitrine` | lista de brechós → perfil da loja; filtro de categoria no catálogo |
| `conta` | cadastro pela UI com termos + onboarding; login/logout; sessão vencida |
| `vendedor` | abrir loja (contrato + CNPJ) e publicar peça com sugestão da IA; editar loja |
| `carrinho` | adicionar, seguir ao checkout e remover |
| `compra` | checkout → Pix → comprovante em análise |
| `pedidos` | lista consolidada e detalhe do pedido |
| `admin` | aprovar comprovante; rejeitar com motivo e comprador reenviar |
| `chat` | pergunta na conversa da Vintex com resposta SSE e peças do catálogo |
| `busca-imagem` | foto no catálogo vira resultados |
| `a11y` | axe (WCAG 2 A/AA) sem violações critical/serious nas telas principais |

## Pré-requisitos

- Python 3.12 e Node 22
- Docker (Postgres com pgvector)
- `pnpm` via corepack

## Rodando local

```bash
# 1. Banco
docker run -d --name vintex-e2e-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=vintex \
  -p 5433:5432 pgvector/pgvector:pg16
docker exec vintex-e2e-pg psql -U postgres -d vintex \
  -c "create extension if not exists vector; create extension if not exists unaccent;"

# 2. Back-end
cd back-end
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt 'moto[server]'

export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/vintex'
.venv/bin/alembic upgrade head
for seed in lojas pecas admin legal; do .venv/bin/python -m app.seeds.$seed; done

# 3. IA determinística + storage S3
AI_PROVIDER=fake .venv/bin/python -m scripts.backfill_embeddings

.venv/bin/moto_server -H 127.0.0.1 -p 9001 &
# bucket (o endpoint regional exige LocationConstraint)
.venv/bin/python - <<'PY'
import boto3
from botocore.config import Config
c = boto3.client('s3', endpoint_url='http://127.0.0.1:9001', region_name='us-east-2',
                 aws_access_key_id='test', aws_secret_access_key='test',
                 config=Config(s3={'addressing_style': 'path'}))
c.create_bucket(Bucket='vintex-local-media',
                CreateBucketConfiguration={'LocationConstraint': 'us-east-2'})
PY

# 4. Front-end
cd ../front-end && corepack pnpm install --frozen-lockfile

# 5. Suíte
cd ../e2e && corepack pnpm install
npx playwright install chromium webkit
corepack pnpm test
```

O `playwright.config.ts` sobe a API e o Vite sozinho (`reuseExistingServer`
fora do CI). Se os servidores já estiverem no ar, a suíte reaproveita.

## Decisões que sustentam a suíte

- **Sessão**: o app guarda o token em `sessionStorage`
  (`vintex.auth.token`, `vintex.auth.user`, `vintex.auth.refreshToken`).
  `storageState` não cobre isso; a fixture injeta as três chaves com
  `addInitScript` antes da primeira navegação.
- **IA**: `AI_PROVIDER=fake` no back-end devolve análise de imagem fixa,
  filtros por palavra-chave e embeddings estáveis (768 dimensões). Nenhuma
  chamada real, nenhuma cota, nenhum flake.
- **Storage**: comprovante e foto exigem bucket; sem `MEDIA_BUCKET` o upload
  responde 503. Local e CI usam um S3 compatível (moto) no `:9001`.
- **Dados**: cada teste cria a própria conta (`@vintex.example.com`) e, quando
  precisa de peça, cria e publica pela API. Nenhum teste depende do outro.
- **ViaCEP**: interceptado com `page.route` para não depender de rede externa.

## Limitações conhecidas

- O sino de notificações do front ainda usa apenas mock
  (`src/services/notificationService.ts`): com `VITE_USE_MOCKS=false` o
  componente se declara indisponível e não aparece. Por isso não há jornada de
  notificações aqui; o back-end (`/api/users/me/notifications`) já responde.
- Sem Firefox e sem regressão visual nesta fase.
- A suíte cobre jornadas, não variações de estado — essas continuam nos testes
  de componente (Vitest).

## CI

`.github/workflows/e2e.yml` roda em PRs que tocam `front-end/**`,
`back-end/**` ou `e2e/**`: Postgres com pgvector, migrations, seeds,
backfill de embeddings, moto, Chromium + WebKit e artefatos do relatório.
