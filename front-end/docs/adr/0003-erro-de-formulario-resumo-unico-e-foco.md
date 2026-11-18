---
status: accepted
date: 2026-09-30
---

# Erro de formulário: um resumo só e o foco no primeiro campo inválido

`InputField`, `TextArea`, `Select`, `PriceInput` e `MediaUploader` punham `role="alert"` na mensagem de erro de cada campo. Num envio vazio do "Quero vender" (`Sell`, 9 campos obrigatórios), isso montava nove regiões `alert` no mesmo render: o leitor de tela despejava tudo de uma vez, o foco ficava no botão e nada dizia quantos erros eram nem onde estavam (#283, item 4). O cadastro de peça (`SellerProductForm`) tinha o mesmo problema, e o `Register` uma versão menor.

**Decidimos que o campo não anuncia o próprio erro.** A mensagem continua visível e ligada ao campo pelo `aria-describedby`, e é lida quando o foco chega nele. Quem anuncia é o formulário, com o `FormErrorSummary`: uma região `alert` só, com a contagem ("Confira 9 campos antes de continuar:") e um link para cada campo. A cada envio recusado, o foco vai ao primeiro campo inválido na ordem da tela.

O padrão vale para os três formulários que usam `error=` hoje (`Sell`, `SellerProductForm`, `Register`) e para qualquer formulário novo.

## Considered Options

- **Só no `Sell`, com uma prop para desligar o `alert` do campo**: resolve a issue sem tocar nas outras telas, mas deixa dois padrões convivendo e o `SellerProductForm` com os mesmos nove alertas.
- **Tirar o `role` dos campos sem pôr nada no lugar**: os formulários ficariam mudos para o leitor de tela, com o erro só visível. Pior que antes.

## Consequences

- Todo formulário com validação no envio precisa renderizar o `FormErrorSummary` e contar os envios (`submitCount`). Sem isso, o erro não é anunciado.
- O resumo repete o texto da mensagem do campo. Em teste, a mensagem do campo se confere com `toHaveAccessibleDescription` no campo, não com `getByText`, que encontra as duas.
- Erros que não são de campo (falha do back no envio, termos que não carregaram) continuam com `role="alert"` próprio: são outra mensagem, fora do resumo.
