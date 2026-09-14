/**
 * Categorias do catálogo, compartilhadas entre `FilterPanel` (que envia) e
 * `ActiveFilters` (que rotula o chip). Em arquivo próprio como o `navLinks.ts`
 * do layout: exportar constante de arquivo de componente quebra o Fast Refresh.
 *
 * O `value` é exatamente o que está gravado em `products.category`, porque a
 * comparação é por igualdade nos dois lados: `matchesFilters` no mock e o
 * filtro do backend. Os dados de exemplo e o seed do RS usam "Roupas",
 * "Acessórios" e "Sapatos" — o rótulo "Calçados" fica na tela, o valor enviado
 * é "Sapatos".
 */
export const CATEGORIES = [
  { label: 'Tudo', value: undefined },
  { label: 'Roupas', value: 'Roupas' },
  { label: 'Acessórios', value: 'Acessórios' },
  { label: 'Calçados', value: 'Sapatos' },
] as const;
