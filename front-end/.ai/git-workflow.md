# Fluxo de Git/PR

- `main` e `develop` são branches protegidas: nenhuma mudança é commitada diretamente nelas.
- Toda mudança exige uma branch própria e um Pull Request para `develop` (ou `main`, conforme o fluxo de release).
- Todo PR deve seguir `.github/PULL_REQUEST_TEMPLATE.md`, incluindo a seção **Uso de IA**, que é obrigatória: descreva quais ferramentas de IA foram usadas e em quais partes (geração de código, revisão, documentação, testes etc.), ou escreva "Nenhuma" se não houve uso.
- Um agente de IA autorizado a commitar/dar push sozinho deve criar uma branch, abrir o PR usando o template e preencher a seção de Uso de IA de forma honesta — nunca commitar direto em `main`/`develop`.
