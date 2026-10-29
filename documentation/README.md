# Documentação viva do vintex-prod

Portal Docusaurus adaptado do [front-end PR #255](https://github.com/Vintex-Ages/front-end/pull/255),
commit `580a8102cdd8edb6bbfd92b0a2bcbc21edcf69f5`.

Use Node.js 24 (a mesma versão do CI) e npm:

```bash
cd documentation
npm ci
npm start    # http://localhost:3000/vintex-prod/
npm run test:docs
npm run build
npm run serve
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

## Dependências herdadas

O lockfile de origem foi atualizado com `npm audit fix` sem `--force`.
Na auditoria de 28/10/2026 restaram 25 alertas (3 baixos, 6 moderados, 1 alto e
15 críticos, incluindo os pacotes que herdam a classificação dos transitivos).
O Docusaurus 3.10.2 ainda depende de `tinypool` 1.x e o bundler usa
`serialize-javascript` 6.x; as versões corrigidas indicadas pelo registry ficam
fora dessas faixas. Há também alertas em `deepmerge` e `uuid` transitivos.

Esta adaptação não força versões incompatíveis por overrides. Reavalie com
`npm audit` e atualize o Docusaurus quando houver uma resolução compatível,
validando novamente o build e o preview. O portal não adiciona um servidor de
produção nem publicação automática.
