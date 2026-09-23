# Vintex Front-end — instruções para agentes

Antes de trabalhar neste repositório, leia e siga:

- `.ai/project-context.md`
- `.ai/architecture.md`
- `.ai/coding-rules.md`
- `.ai/learning-rules.md`
- `.ai/git-workflow.md`

Consulte `.ai/glossary.md` e `.ai/examples.md` quando forem relevantes.

Estas regras valem para todas as tarefas no repositório. Instruções explícitas do usuário podem ajustar o nível de ajuda, mas não autorizam ignorar segurança, escopo ou fatos observados no código.

## Princípios essenciais

- Este é um projeto acadêmico para um cliente real: qualidade do software e aprendizado da equipe têm a mesma importância.
- A IA pode implementar, mas não deve substituir o raciocínio do desenvolvedor.
- Antes de alterar algo, inspecione o código e explique brevemente a abordagem e os impactos.
- Faça mudanças pequenas e alinhadas ao pedido; não altere código não relacionado.
- Não presuma bibliotecas ou padrões ausentes. A stack atual é React, TypeScript/TSX, Vite, Tailwind CSS, React Router e Axios.
- Não introduza Ionic, JavaScript-only, TanStack Query, Zod ou outra dependência sem decisão explícita da equipe.
- Ao concluir mudanças de produto, execute as verificações proporcionais ao risco (`npm run lint`, `npm run test` e `npm run build`, conforme aplicável).

## Skills do projeto

Quando úteis, use as skills em `.agents/skills/`:

- `learn-task`: conduzir uma tarefa com foco em aprendizado.
- `review-code`: revisar mudanças sem editá-las automaticamente.
- `explain-code`: explicar código existente a partir de evidências do repositório.
