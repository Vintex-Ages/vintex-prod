# Documentação viva do back-end

Portal Docusaurus do back-end, criado na VE-25
([back-end#176](https://github.com/Vintex-Ages/back-end/issues/176)) e trazido para
o monorepo com a importação do back-end. Cobre o domínio, a arquitetura e a
infraestrutura da API. O portal da raiz ([`../../documentation/`](../../documentation/README.md))
cobre GitOps, promoções e governança do repositório inteiro.

```bash
cd back-end/documentation
npm ci
npm start      # http://localhost:3000
npm run build
```

O CI deste portal usa Node.js 20 e npm (`package-lock.json`); o portal da raiz usa
Node.js 24 e pnpm.

## Estrutura

```
documentation/
├── docs/
│   ├── intro.md
│   ├── dominio/          # regras de negócio e rotas, uma página por assunto
│   ├── arquitetura/      # fundação HTTP, configuração, IA, migrations, ADRs
│   └── infraestrutura/   # ambiente local, mensageria, AWS staging e produção
├── path-map.json         # caminho de código -> página
├── docusaurus.config.js
├── sidebars.js           # sidebar gerada a partir de docs/
└── src/css/custom.css    # inclui o marcador .verificar
```

Cada pasta de `docs/` tem um `_category_.json` com o rótulo e a ordem na sidebar.

## Como escrever uma página

Siga o formato das páginas existentes:

1. Front matter com `sidebar_position`.
2. Título e uma linha **Fonte de verdade** com os arquivos de código e as issues.
3. Uma tabela de rotas (rota, o que faz, resposta e erros com o `code` do envelope).
4. **As decisões**: o porquê de cada comportamento que não é óbvio, com as RNs.
5. Quando o código diverge da issue ou a decisão não está registrada, use o
   marcador `<span className="verificar">*</span>` e uma nota dizendo o que falta
   confirmar e com quem.

Descreva o que o código faz hoje, não o que a issue pedia.

## Mapa de caminhos e rascunho por PR

`path-map.json` liga cada caminho de `back-end/` à página que deve ser revisada
quando ele muda. A primeira correspondência vence (padrões `fnmatch`), então
caminhos específicos vêm antes dos genéricos, como `infra/**`.

`back-end/scripts/docs/generate_draft.py` casa os arquivos alterados de um PR com
o mapa. O workflow
[`back-end-documentation-draft.yml`](../../.github/workflows/back-end-documentation-draft.yml)
remove o prefixo `back-end/` dos caminhos, gera o rascunho, builda o portal como
artifact (14 dias) e comenta no PR com o marcador `<!-- documentation-draft-bot -->`.
Ele é informativo e nunca bloqueia o merge.

`tests/test_generate_draft.py` roda no CI do back-end e falha quando:

- o mapa aponta para uma página que não existe em `docs/`;
- uma página de `docs/` não tem nenhum caminho no mapa;
- um padrão aparece duas vezes (o segundo nunca seria usado).

Ao criar uma página, acrescente ao mapa os caminhos que ela descreve.

## Uso de IA

A integração com o Cognitrace, que popularia páginas a partir do uso de IA, é
escopo da VE-28 ([back-end#179](https://github.com/Vintex-Ages/back-end/issues/179)).
`docs/` é Markdown simples, sem convenção que precise ser desfeita para isso.
