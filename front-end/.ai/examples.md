# Exemplos de aplicação

## Nova página que consome API

1. Confirmar contrato e estados da experiência.
2. Definir tipos compartilhados em `src/types/` quando reutilizados.
3. Isolar HTTP em `src/services/`.
4. Montar a página em `src/pages/` com estados de carregamento, erro e vazio.
5. Extrair componentes apenas quando houver responsabilidade ou reutilização clara.
6. Adicionar a rota em `src/routes/` e testes de comportamento relevante.

## Mudança que exige decisão

Adicionar uma biblioteca de estado remoto, trocar a estratégia de autenticação ou definir persistência de token não é uma escolha local de implementação. Documente alternativas e obtenha uma decisão antes de consolidar o padrão.
