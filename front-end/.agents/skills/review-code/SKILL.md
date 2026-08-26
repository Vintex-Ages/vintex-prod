---
name: review-code
description: Revisa mudanças do front-end Vintex quanto a correção, segurança, arquitetura, acessibilidade e testes. Use em pedidos de code review, revisão de diff ou preparação para merge.
---

# Review Code

Leia `.ai/architecture.md`, `.ai/coding-rules.md` e `.ai/learning-rules.md`.

Revise sem editar, salvo pedido explícito. Examine primeiro o diff e depois o contexto necessário. Priorize bugs, regressões, segurança, contratos da API, acessibilidade e testes; evite comentários apenas estéticos já cobertos pelas ferramentas.

Verifique também:

- Se a seção **Uso de IA** do PR (conforme `.github/PULL_REQUEST_TEMPLATE.md`) foi preenchida.
- Se componentes compartilhados revisados não contêm regra de negócio (chamadas HTTP, validação específica de tela etc.), conforme `.ai/coding-rules.md`.

Para cada achado, informe severidade, arquivo/local, cenário de falha e correção sugerida. Diferencie problemas confirmados de perguntas. Se não houver achados, diga isso e registre riscos ou verificações que não puderam ser executadas.
