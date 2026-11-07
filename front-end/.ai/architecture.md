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

## Tokens e style guide v.2

Decisão da FE-FND-5 (#206), comparando o style guide v.2 do Figma (frame
`45:22291`) com `src/styles/tokens.ts`:

- **Cores:** a v.2 tem 11 cores. `vermelhao` (`#982632`) entrou como token, ainda
  sem uso. `vermelho-escuro` continua `#7D0020`: o style guide v.2 mostra
  `#741D27`, mas as telas desenhadas e as variáveis do arquivo ainda usam
  `#7D0020`, e trocar agora deixaria o app diferente das telas. Qual vermelho é a
  cor de ação fica para o design confirmar; quando confirmar, troca-se o valor
  (e, se for o vermelhão, as classes das ações) sem mudar os nomes dos tokens.
- **Tipografia:** tamanhos máximos iguais aos da v.2 (display 6rem, h1 4.5rem,
  h2 3rem, body 1rem/1.65). Diferenças de entrelinha e o label (`.68rem` na v.2,
  `.75rem` aqui) ficam como estão: a própria v.2 marca a tipografia como "em
  validação".
- **Espaçamento:** a régua da v.2 (4–64px, múltiplos de 4) já está contida na
  escala.
- **Breakpoints:** iguais (0 · 720 · 1050).

## Decisões pendentes

- estratégia definitiva de autenticação e armazenamento de token no cliente;
- convenção de camada de serviços e tratamento de erros;
- biblioteca/abordagem para estado remoto, se necessária;
- estratégia de testes de componentes e E2E;
- identidade visual e tokens finais.
