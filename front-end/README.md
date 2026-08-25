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
