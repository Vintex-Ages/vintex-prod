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

/**
 * Opções dos filtros de múltipla escolha do catálogo.
 *
 * O `FilterPanel` já aceitava `sizeOptions`/`conditionOptions`/`colorOptions`,
 * mas nenhuma tela passava nada: o painel abria com quatro `fieldset` só de
 * legenda — "Tamanho", "Marca", "Conservação" e "Cor" como títulos soltos sem
 * nada embaixo.
 *
 * Os valores são o domínio do seed do back (`app/seeds/pecas.py`, espelhado em
 * `src/mocks/products.ts`) e são comparados por igualdade nas duas pontas,
 * como as categorias. **Quando existir um endpoint de facetas, estas listas
 * saem daqui e passam a vir dele** — marca, em especial, é domínio aberto e
 * não cabe numa constante: por isso não está aqui, e o grupo de marca só
 * aparece quando quem usa o painel tiver a lista para passar.
 */
export const SIZES = ['P', 'M', 'G', 'GG', '38', '40'] as const;

export const CONDITIONS = ['Novo com etiqueta', 'Seminovo', 'Usado', 'Marcas de uso'] as const;

export const COLORS = [
  'Preto',
  'Branco',
  'Azul',
  'Verde',
  'Vermelho',
  'Bege',
  'Estampado',
] as const;
