# Glossário

- **View/Route**: camada FastAPI que recebe e responde HTTP.
- **Controller**: camada de casos de uso e regras de negócio.
- **Repository**: camada de acesso a dados e queries.
- **Schema**: contrato Pydantic de entrada ou saída.
- **Model**: entidade persistida pelo SQLAlchemy.
- **JWT**: access token de autenticação (HS256, 30 min), renovado por refresh token; ver ADR 0002.
- **Worker**: processo separado da API que consome a fila SQS de análise de imagens.
- **ADR**: registro de decisão de arquitetura, em `.ai/adr/`.

Termos do domínio do produto (situações da peça, Suspensa, Reclamação, selo Confiável): ver `CONTEXT.md`.
- **Migration**: alteração versionada do schema do banco com Alembic.

Amplie este arquivo somente com termos confirmados pelo domínio ou pela equipe.
