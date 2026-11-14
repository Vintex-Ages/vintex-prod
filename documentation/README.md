# Documentação viva do vintex-prod

Portal Docusaurus adaptado do [front-end PR #255](https://github.com/Vintex-Ages/front-end/pull/255),
commit `580a8102cdd8edb6bbfd92b0a2bcbc21edcf69f5`.

Use Node.js 24 (a mesma versão do CI) e pnpm. A versão do pnpm vem do campo
`packageManager` do `package.json` (a mesma do `front-end/`):

```bash
cd documentation
pnpm install --frozen-lockfile
pnpm start    # http://localhost:3000/vintex-prod/
pnpm test:docs
pnpm build
pnpm serve
```

O conteúdo fica em `docs/`; `path-map.json` relaciona caminhos do repositório às
páginas que precisam de revisão. A primeira regra correspondente vence; `*` e
`**` representam qualquer sequência de caracteres, incluindo subdiretórios.
Arquivos sem mapeamento aparecem no rascunho e não são erro.

O gerador pode ser executado da raiz, sem instalar dependências:

```bash
git diff --name-only origin/develop...HEAD > /tmp/vintex-docs-changed.txt
node scripts/docs/generate-draft.mjs --changed-files-file /tmp/vintex-docs-changed.txt
node --test scripts/docs/generate-draft.test.mjs
```

A CLI também aceita `--path-map <arquivo>` e `--output <arquivo>`.

## Automação por PR

`documentation-ci.yml` testa o gerador e verifica se as páginas do mapa existem.
`documentation-draft.yml` gera um rascunho, atualiza um único comentário e anexa
`documentation/build/` como artifact por 14 dias. Baixe o artifact pela execução
do workflow; para visualizar o site, sirva os arquivos sob `/vintex-prod/`.
O preview não é publicado em GitHub Pages e suas falhas são informativas.

Os dois workflows só rodam quando o PR altera caminhos que o `path-map.json`
mapeia (lista em `paths:`), e não em todo PR: código de `front-end/` e de
`back-end/` fica de fora. O comentário usa o marcador
`<!-- documentation-draft-bot:root -->`, distinto do `Back-end Documentation Draft`
(`<!-- documentation-draft-bot -->`), para os dois portais comentarem no mesmo PR
sem se sobrescrever. Ao acrescentar um padrão ao mapa, inclua o caminho nos
`paths:`; o teste do gerador confere.

O workflow usa `pull_request`, sem acesso aos segredos de forks. PRs de forks
podem gerar artifacts, mas pulam o comentário por não terem permissão de escrita.
Como o workflow é novo, sua primeira execução em um PR pode depender da aprovação
de workflows do GitHub. Nenhum conteúdo Markdown é alterado automaticamente.

## Manutenção

Atualize o Markdown junto com a implementação e adicione caminhos ao mapa quando
necessário. Os links de edição apontam para `develop`; a URL configurada para
GitHub Pages serve apenas como base de navegação, sem habilitar publicação.

O portal documenta o estado atual do GitOps. O roadmap AWS continua sendo uma
proposta, não uma implantação existente. Conteúdo e artifacts são públicos;
nunca inclua credenciais ou valores sensíveis.

## Dependências

O portal usa pnpm, como o resto do repositório, e o lockfile é o
`pnpm-lock.yaml`. Ele foi gerado com `pnpm import` a partir do `package-lock.json`
de origem, então as versões instaladas são as mesmas. O `pnpm-workspace.yaml`
declara que o `core-js` não roda script de build (ele só imprime um aviso), para o
`pnpm install` não terminar com `ERR_PNPM_IGNORED_BUILDS`.

Em 14/11/2026, `pnpm audit` apontava 8 alertas (2 baixos, 2 moderados, 2 altos e
2 críticos), todos em dependências transitivas do Docusaurus 3.10.2. A auditoria
não faz parte do CI deste portal. Esta adaptação não força versões por
overrides: atualize o Docusaurus quando houver uma versão que resolva e valide o
build e o preview. O portal não adiciona um servidor de produção nem publicação
automática.
