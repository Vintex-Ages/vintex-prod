# front-end

Consulte o [guia de contribuição](CONTRIBUTING.md) antes de abrir uma issue ou Pull Request.

Repositório de front-end do projeto **Vintex**, PoC de marketplace de moda circular
(brechós e microempreendedores de moda usada), conforme o Termo de Abertura do Projeto
(AGES, 2LM4LM, semestre 2026/2).

Este repositório é responsável **apenas pela camada de front-end**. Back-end, IA e
outras responsabilidades vivem em repositórios separados.

## Stack

- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) para estilização

## Estrutura de pastas

Estrutura inicial, ainda sem implementação — pastas organizadas por
responsabilidade, prontas para o time preencher:

```
src/
├── assets/          # imagens, ícones, fontes
├── components/
│   ├── layout/       # componentes de layout (navbar, footer...)
│   ├── common/        # componentes genéricos reutilizáveis
│   ├── product/       # componentes ligados a produto
│   └── auth/          # componentes ligados a autenticação
├── context/          # contextos globais (tema, autenticação...)
├── hooks/            # hooks customizados
├── pages/            # uma pasta por página/rota
│   ├── Landing/
│   ├── Auth/Login, Auth/Register
│   ├── Catalog/
│   ├── Product/
│   ├── SellerProfile/
│   ├── SellerAdmin/
│   ├── PlatformAdmin/
│   └── Vintex/        # assistente de IA
├── routes/           # definição de rotas
├── services/         # acesso a dados / chamadas à API
├── styles/           # estilos globais
└── types/            # tipos compartilhados
```

A divisão de páginas segue as áreas descritas na "Descrição do projeto em alto
nível" do Termo de Abertura: landing, autenticação, catálogo, página de produto,
perfil do brechó, painel do vendedor, dashboard do dono da plataforma e a
assistente de IA Vintex.

## Como rodar

```bash
npm install
npm run dev
```

### Rodar contra a API real

O padrão é mock. Para consumir a API do back-end, crie `.env.local` com a flag
global desligada:

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_USE_MOCKS=false
```

`VITE_USE_MOCKS` vale para todos os services de uma vez — não há override por
service. Qualquer valor diferente de `false` mantém o mock, inclusive a variável
ausente, então o projeto continua rodando sem `.env.local`. Com o mock
desligado, erro HTTP é erro: não há queda automática para o mock.

`VITE_API_BASE_URL` já termina em `/api` de propósito — é o `baseURL` do
`httpClient`, e por isso os caminhos nos services começam depois dele
(`/users/me/store`, e não `/api/users/me/store`).

No repositório do back-end, prepare o ambiente conforme o README próprio e
inicie a API:

```bash
cd ../back-end
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python -m app.seeds.lojas
python -m app.seeds.pecas
uvicorn app.main:app --reload
```

A API sobe em `http://localhost:8000`. Em outro terminal, de volta a este
repositório:

```bash
npm run dev
```

Reinicie o Vite sempre que alterar qualquer variável de ambiente — o Vite lê o
`.env` uma vez, no boot.

**O que ainda não funciona com o mock desligado:** salvar preferências, no fim
do onboarding e na tela de perfil. O front chama `GET` e `PUT
/users/me/preferences` e a rota não existe na `develop` do back
(`back-end#80` e `back-end#81`). Ler os estilos funciona (`GET /styles`), então
a tela carrega e só falha ao concluir.

As partes de IA (conversa com a Vintex e preenchimento da peça pela foto)
exigem `AI_PROVIDER=google` e uma `GOOGLE_API_KEY` no `.env` do back — com o
default `unavailable`, o back responde 503 e o front mostra o aviso de
indisponibilidade.

Outros scripts:

```bash
npm run build     # build de produção
npm run lint       # lint (ESLint)
npm run format     # formatação (Prettier)
npm run test       # testes (Vitest)
```

## CI

O workflow em `.github/workflows/ci.yml` roda no GitHub Actions a cada push
ou Pull Request nas branches `main` e `develop`:

1. Instala dependências (`npm ci`)
2. Lint (`npm run lint`)
3. Auditoria de dependências (`npm audit --audit-level=high`) — bloqueia o CI
   se alguma dependência tiver vulnerabilidade conhecida de severidade alta
   ou crítica
4. Checagem de tipos (`tsc --noEmit`)
5. Testes (`npm run test`)
6. Build (`npm run build`), com o resultado publicado como artefato

Recomendado configurar esse workflow como _required status check_ na proteção
das branches `main` e/ou `develop`, bloqueando merge de PRs que quebrem lint,
tipos, testes ou build.

Ainda não configurados (a adicionar depois, cada um como job/workflow
separado, sem alterar este):

- Testes E2E (Playwright)
- Deploy automatizado (Vercel/Netlify)

## Convenções

- Alias de import `@/` aponta para `src/` (configurado em `vite.config.ts` e `tsconfig.json`).

## Escopo (o que este repositório NÃO cobre)

- Integração real com meios de pagamento (apenas mock/simulação, conforme Termo
  de Abertura).
- Lógica de back-end, banco de dados e modelos de IA — consumidos via API REST.

## Próximos passos

- [ ] Definir arquitetura de camadas (services, context, types etc.) e implementar as páginas.
- [ ] Definir identidade visual final (paleta, tipografia) da Vintex.
- [ ] Adicionar testes E2E com Playwright (headless) quando fizer sentido.
- [ ] Avaliar deploy automatizado (Vercel/Netlify) quando fizer sentido.
