# Ambiente local (LocalStack e MiniStack)

Root Terraform do ambiente local. O provider AWS aponta para o LocalStack e o
MiniStack do Compose `vintex-infra`, nunca para a AWS real; as credenciais `test`
do `main.tf` não são segredo.

Cria a rede e o papel de execução ECS (VE-14), o bucket de mídia e a fila de
análise de imagens com a DLQ, usando os mesmos módulos que a produção usa
(`network`, `media_storage`, `ai_messaging`).

Use os alvos do `Makefile`, na raiz do back-end. Sem ambiente, os alvos de
Terraform usam `local`:

```bash
make terraform-init
make terraform-validate
make terraform-test
make infra-complete   # QA, subida, testes e derrubada do ambiente
```

Detalhes em
[`documentation/docs/infraestrutura/teste-local.md`](../../../../documentation/docs/infraestrutura/teste-local.md).
