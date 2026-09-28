# Arquitetura

## Stack observada

- React 18 com TypeScript/TSX
- Vite
- Tailwind CSS
- `react-router-dom`
- Axios
- Vitest, ESLint e Prettier

Não há Ionic, TanStack Query ou Zod instalados. Não adote padrões dessas ferramentas sem decisão explícita.

## Organização pretendida

- `src/pages/`: páginas por rota/área funcional.
- `src/components/`: componentes reutilizáveis, separados por responsabilidade.
- `src/routes/`: composição e proteção de rotas.
- `src/services/`: acesso à API; componentes não devem espalhar detalhes HTTP.
- `src/context/`: estado global apenas quando realmente compartilhado.
- `src/hooks/`: comportamento React reutilizável.
- `src/types/`: contratos TypeScript compartilhados.
- `src/styles/` e `src/assets/`: estilos e recursos visuais.

Use o alias `@/` para imports a partir de `src/`. Prefira estado local e composição simples antes de adicionar abstrações globais. Trate contratos da API como fronteira externa e mantenha estados de carregamento, vazio e erro explícitos na interface.

## Decisões pendentes

- estratégia definitiva de autenticação e armazenamento de token no cliente;
- convenção de camada de serviços e tratamento de erros;
- biblioteca/abordagem para estado remoto, se necessária;
- estratégia de testes de componentes e E2E;
- identidade visual e tokens finais.
