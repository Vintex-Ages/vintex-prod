# Regras de código

- Escreva componentes funcionais em TypeScript/TSX e mantenha props e retornos tipados.
- Preserve as configurações de TypeScript, ESLint e Prettier; não enfraqueça verificações para fazer o código passar.
- Prefira componentes pequenos e coesos; extraia hooks somente quando houver comportamento reutilizável.
- Centralize chamadas HTTP em `src/services/` e não misture detalhes de transporte com apresentação.
- Componentes compartilhados (`src/components/common/` ou equivalente) não devem conter regra de negócio — nem chamadas HTTP, nem validação específica de uma tela (ex.: um `if` que só faz sentido em um fluxo particular). Mantenha-os restritos a apresentação e comportamento genérico; regra de negócio pertence à página ou ao hook que a usa.
- Trate carregamento, erro, ausência de dados e sucesso de forma explícita.
- Use Tailwind conforme configurado e evite valores visuais arbitrários quando existir token reutilizável.
- Garanta HTML semântico, navegação por teclado, rótulos de formulário e contraste adequado.
- Não adicione dependências sem justificar a necessidade e verificar compatibilidade com a stack.
- Não exponha segredos no bundle; somente variáveis públicas apropriadas ao Vite podem chegar ao cliente.
- Cubra comportamento relevante com Vitest quando a mudança introduzir lógica ou corrigir defeito.
- Antes de concluir, execute as verificações adequadas: `npm run lint`, `npm audit --audit-level=high`, `npm run test` e `npm run build` (o audit também é bloqueante no CI).
