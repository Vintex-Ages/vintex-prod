# Estados de interação

Regra única para hover, foco e pressionado em elementos interativos (botões,
links, ícone-botão). Todo componente novo já nasce com isto.

Enquanto o Figma não traz valores de hover inspecionáveis, a regra é derivada e
não cria token de cor novo (a paleta é fechada em 10 cores, ver
`src/styles/tokens.ts`). Se o design especificar valores, troca-se
`brightness-*` por um token `*-hover` dedicado sem mudar a estrutura das classes.
Histórico e decisão: issue #130.

## Hover

`future.hoverOnlyWhenSupported` está ligado em `tailwind.config.ts`, então
`hover:` só vale em ponteiro fino e não "gruda" após um toque no mobile. Não é
preciso `@media (hover: hover)` manual.

- Variante preenchida (fundo sólido: `bg-vermelho-escuro`, `bg-verde-rs`):
  `hover:brightness-110` + `transition`
- Botão vazado / quiet / ghost / ícone com cor de ação:
  `hover:bg-vermelho-suave` + `transition-colors`
- Botão vazado / quiet / ghost / ícone neutro (`text-tinta`):
  `hover:bg-papel-profundo` + `transition-colors`
- Link inline (texto, `p-0`, sem área de toque própria): `hover:underline`.
  Não usar state layer de fundo, quebra o fluxo do texto.

## Foco (`focus-visible`)

Obrigatório (WCAG 2.4.7). Nunca `outline-none` sem repor o indicador. Usar
`focus-visible:`, não `focus:`, para o anel não aparecer em clique de mouse
(exceção: campos de texto, onde `:focus` é o correto).

- Botão / ícone-botão: `focus:outline-none focus-visible:ring-2` +
  `focus-visible:ring-tinta` (nos preenchidos, `focus-visible:ring-branco-quente`,
  que o anel escuro some sobre o fundo).
- Item de lista full-width (linha de menu): adicionar `focus-visible:ring-inset`
  para o anel não ser cortado pela borda do container.
- Link inline e checkbox: `focus-visible:outline-2 focus-visible:outline-offset-2`
  na cor de ação. `outline` acompanha a quebra de linha melhor que `ring`.

## Pressionado (`active`)

Opcional, só quando o componente precisa de feedback tátil de clique. Nenhum
componente atual usa. Se for adicionar: `active:brightness-95` nos preenchidos,
`active:bg-linha/60` nos neutros.

## Desabilitado

Já padronizado, repetido aqui para referência:
`disabled:opacity-50 disabled:cursor-not-allowed`.

## Fora de escopo

- Modo escuro: sem paleta em `tokens.ts`; rever quando existir.
- Escala / sombra / transform em hover: decisão por componente, não é regra
  geral.

## Referências

- Decisão e histórico: issue #130
- Tokens: `src/styles/tokens.ts` -> `tailwind.config.ts`
- `.ai/coding-rules.md` (token via utilitário, nunca hex; teclado e contraste)
- `.ai/examples.md` (passo a passo de componente novo)
