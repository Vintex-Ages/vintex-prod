# Exemplos de aplicação

## Nova página que consome API

1. Confirmar contrato e estados da experiência.
2. Definir tipos compartilhados em `src/types/` quando reutilizados.
3. Isolar HTTP em `src/services/`.
4. Montar a página em `src/pages/` com estados de carregamento, erro e vazio.
5. Extrair componentes apenas quando houver responsabilidade ou reutilização clara.
6. Adicionar a rota em `src/routes/` e testes de comportamento relevante.

## Novo componente de design system

1. Localizar o componente correspondente no Figma e identificar suas variantes.
2. Verificar se as cores/tokens necessários já existem em `tailwind.config.js`; se não existirem, adicioná-los lá antes de usar no componente (nunca usar hex direto no código).
3. Criar o componente em `src/components/common/` (ou pasta apropriada), tipado em TypeScript, sem nenhuma regra de negócio (lógica de API, validação específica de tela, etc.) — apenas apresentação e comportamento genérico.
4. Garantir que funciona em modo claro e escuro.
5. Documentar o componente com um exemplo de uso em comentário no arquivo.

## Mudança que exige decisão

Adicionar uma biblioteca de estado remoto, trocar a estratégia de autenticação ou definir persistência de token não é uma escolha local de implementação. Documente alternativas e obtenha uma decisão antes de consolidar o padrão.
