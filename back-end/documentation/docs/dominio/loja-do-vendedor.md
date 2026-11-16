---
sidebar_position: 8
---

# Loja do vendedor

Fonte de verdade: `app/views/store_routes.py` (`me_router`), `app/controllers/store_controller.py` e `app/schemas/store_schema.py`. A criação e a leitura vêm da BE-US006-1 ([#141](https://github.com/Vintex-Ages/back-end/issues/141)); a edição, da BE-US006-3 ([#221](https://github.com/Vintex-Ages/back-end/issues/221)).

A loja do próprio vendedor vive sob `/api/users/me/store` (ADR 0001 §4) e exige login. Um vendedor tem uma loja.

## Rotas

| Rota | O que faz |
| --- | --- |
| `POST /api/users/me/store` | cria a loja: nome, descrição, logo, chave Pix, endereço, documento e versão do contrato |
| `GET /api/users/me/store` | a própria loja, com chave Pix, documento e selo; `404 STORE_NOT_FOUND` sem loja |
| `PATCH /api/users/me/store` | edita nome, descrição, `logo_url`, endereço e chave Pix; `404 STORE_NOT_FOUND` sem loja |

## O selo na própria loja

`GET /api/users/me/store` devolve `verified` (RN-73), o mesmo selo da loja pública. O painel do vendedor deixou de fazer uma segunda requisição só para saber se a loja tem o selo ([#259](https://github.com/Vintex-Ages/back-end/issues/259)).

## O documento do vendedor

`document_value` é conferido pelo **dígito verificador**, não só pela contagem de dígitos ([#217](https://github.com/Vintex-Ages/back-end/issues/217)). Antes, `00000000000` criava a loja e ganhava o selo Confiável, que aparece na loja pública, e `11144477735X` era gravado com a letra. O front já validava; a API chamada direto aceitava qualquer coisa.

- **A regra mora em `app/core/documento.py`**, portada de `front-end/src/utils/document.ts` com o mesmo módulo 11 e a mesma recusa de sequência repetida (`111.111.111-11` passa no cálculo, então é recusada à parte). Mudar a regra é mudar nas duas pontas. O front valida para o erro aparecer no campo antes do envio; a validação que vale é a do back.
- **`only_digits` aceita só 0-9**, como o `/\D/g` do front. `str.isdigit` aceitaria dígito de outros alfabetos, que não é documento.
- **Documento inválido responde `422` no campo `document_value`**, para o front destacar o input. A contagem de dígitos mantém a mensagem que já existia.
- **O selo Confiável usa a mesma função** (`seller_controller._documento_valido`). Vendedor gravado antes da correção com documento inválido não ganha o selo.
- A tabela `{"CPF": 11, "CNPJ": 14}` (`DOCUMENT_DIGITS`) é a fonte única; a duplicação entre o schema e o controller acabou.
- O seed de lojas passou a usar CNPJs válidos e diferentes, um por filial. Bancos já semeados não mudam, porque o seed procura a loja pelo nome.

## A versão do contrato

`terms_version` no cadastro da loja é opcional. Quando vem, precisa existir em `legal_documents`: versão inexistente responde `422` e **não grava** `terms_accepted_at`. Antes, `v999-nao-existe` respondia `201` com a data de aceite carimbada, ou seja, um aceite jurídico apontando para um documento que não existe. O carimbo usa `utcnow_naive()` (`app/core/clock.py`), como o resto do app.

Sem versão, não há data de aceite: data sem versão registraria um aceite que ninguém deu.

> <span className="verificar">*</span> **Verificar com quem implementou a #217.** (1) A versão é conferida contra o **contrato de venda** (`SELLER_CONTRACT`), seguindo o comentário do schema sobre a tela de aceite do contrato; a própria descrição do PR diz que, se o certo for `termos_uso`, a troca é uma linha no `store_controller`. (2) O cadastro de usuário (`POST /api/auth/register`, `accepted_terms_version`, da #259) **não confere** a versão contra `legal_documents`: aceita qualquer texto de até 20 caracteres. É o mesmo defeito que a #217 fechou aqui, em outra rota, e o PR o deixou para uma issue própria. (3) O critério "fixtures da suíte trocados por documentos válidos" não foi cumprido por inteiro: testes que criam o `Seller` direto pelo ORM seguem com documentos que não passam pela validação.

## Edição

- **PATCH parcial:** só o que vem no corpo muda. Campo ausente não é apagado, e corpo vazio devolve a loja como estava.
- **`null` explícito limpa o campo.** É como se tira a logo (`"logo_url": null`). O nome é a exceção: é obrigatório, e `"name": null` responde 422.
- **O endereço vem inteiro**, com os mesmos campos do cadastro, e substitui o que havia. A loja que já tinha endereço reaproveita a linha em `addresses`; a que não tinha ganha uma. A UF é gravada em maiúscula, como no cadastro.
- **O documento não é alterável por aqui.** `document_type` e `document_value` mudam a identidade do vendedor e têm unicidade, então são outra rota com regra própria. Mandá-los responde 422 (`extra="forbid"`), em vez de serem ignorados com uma resposta 200 que diria que deu certo.
- A logo nova sobe antes por `POST /api/users/me/media` com `kind=logo`, como no cadastro (ver [Mídia](./midia)).

## Transação

O `StoreRepository` não faz commit, como o resto do app (ADR 0001 §6): `save` adiciona e dá `flush`, e quem fecha a transação é o `StoreController`. Antes o `save` commitava, e um `PATCH` não teria controle da própria transação.
