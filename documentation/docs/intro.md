---
slug: /
sidebar_position: 1
---

# Vintex — Produção

O `vintex-prod` controla a composição de releases do Vintex por GitOps. Ele
versiona referências imutáveis ao front-end e ao back-end, além das regras que
organizam as promoções e a revisão de Pull Requests.

## Onde começar

- [Arquitetura GitOps](arquitetura/gitops.md): responsabilidades e fluxo de branches.
- [Manifestos e promoções](operacao/promocoes.md): origem dos componentes e evidências de release.
- [Governança de PRs](governanca/pull-requests.md): branches, issues, validação e revisão.
- [Roadmap AWS](operacao/aws.md): decisões pendentes antes de habilitar CD.

O portal foi adaptado do [PR #255 do front-end](https://github.com/Vintex-Ages/front-end/pull/255).
O [mapa de caminhos](https://github.com/Vintex-Ages/vintex-prod/blob/develop/documentation/path-map.json)
permite indicar as páginas que precisam de revisão quando um PR altera arquivos
do repositório. O rascunho e o preview são informativos; o autor mantém o conteúdo
Markdown e as validações GitOps existentes continuam independentes.

Os repositórios de aplicação mantêm seus próprios códigos e contratos. Este
portal documenta a composição operacional; o deploy automático AWS ainda é uma
etapa futura.
