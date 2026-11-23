# Contexto do projeto

O Vintex é uma prova de conceito de marketplace de moda circular para brechós e microempreendedores de moda usada, desenvolvido na disciplina AGES no semestre 2026/2 para um cliente real.

Este diretório (`back-end/` no monorepo `vintex-prod`) cobre a API. O front-end fica em `front-end/`, no mesmo monorepo; pipeline, governança e manifestos ficam na raiz. O back-end foi importado do repositório `Vintex-Ages/back-end` em 04/11/2026, e as issues antigas continuam lá.

A API já cobre autenticação, catálogo, loja do vendedor, carrinho, pedidos com comprovante Pix, favoritos, avaliações, notificações, painel e moderação da administradora, e as funções de IA (análise de foto, conversa com a Vintex, busca por semelhança, sugestão de preço). O comportamento de cada área está descrito em `documentation/docs/`, que é a referência para o estado atual; a API deve evoluir a partir de requisitos confirmados e contratos explícitos.

Tecnologias observadas: Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL 16 com pgvector, Alembic, Pydantic Settings, Pytest, Ruff, Black, Docker, SQS (LocalStack no ambiente local) e Terraform para a AWS.
