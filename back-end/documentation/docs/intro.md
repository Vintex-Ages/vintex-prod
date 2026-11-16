---
slug: /
sidebar_position: 1
---

# Vintex — Back-end

Documentação viva do back-end, em `back-end/documentation/` no monorepo `vintex-prod`. Nasceu no repositório `Vintex-Ages/back-end` (VE-25, [#176](https://github.com/Vintex-Ages/back-end/issues/176)), que foi encerrado quando o back-end foi importado para cá (2026-11-04). As issues antigas continuam em `Vintex-Ages/back-end`; o código e a documentação passam a mudar neste repositório.

O [`path-map.json`](https://github.com/Vintex-Ages/vintex-prod/blob/develop/back-end/documentation/path-map.json) liga cada caminho de código à página que deveria ser revisada quando ele muda. Todo PR que altera `back-end/**` recebe um comentário automático apontando essas páginas (workflow [`back-end-documentation-draft.yml`](https://github.com/Vintex-Ages/vintex-prod/blob/develop/.github/workflows/back-end-documentation-draft.yml)); é informativo e nunca bloqueia o merge. Os caminhos do mapa são relativos a `back-end/`.

## Onde começar

- [Fundação HTTP](arquitetura/fundacao-http) — envelope de erro, autorização por papel, paginação, prefixo `/api`.
- [Configuração por ambiente](arquitetura/configuracao) — variáveis do `.env` e o que é recusado em produção.
- [Provedor de IA](arquitetura/provedor-ia) — abstração `AIProvider`, `UnavailableAIProvider`, fallback de modelo e repetição no 503.
- [Pedidos do comprador](dominio/pedidos-do-comprador) e [Validação do comprovante](dominio/validacao-de-comprovante) — do carrinho ao pedido confirmado.
- [Painel da administradora](dominio/painel-da-administradora) — os números gerais da plataforma.
- [Infraestrutura de teste local](infraestrutura/teste-local) — Makefile, Compose `vintex-infra`, Terraform, LocalStack, MiniStack.

## Como ler os marcadores

<span className="verificar">*</span> **Asterisco vermelho** = o texto descreve o que o código faz, mas isso diverge do que a task (issue) pedia, ou a decisão não está registrada. Passe o mouse sobre o asterisco para ver o motivo; o detalhe também fica escrito no próprio texto, em uma nota que começa com o mesmo marcador. Quem implementou a feature confirma e, resolvido, remove o marcador e a nota.

## Sobre o uso de IA neste portal

A integração com o addon **Cognitrace**, que popula automaticamente páginas a partir do uso de IA no desenvolvimento, é escopo da issue [VE-28 (#179)](https://github.com/Vintex-Ages/back-end/issues/179). Este portal já está estruturado como Markdown simples em `docs/` para receber esse conteúdo sem mudança de formato.
