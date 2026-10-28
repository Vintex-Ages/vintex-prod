import type { ProductDetail } from '@/types/product';

/**
 * Peças de brechó para o catálogo de demonstração. As fotos locais em
 * `public/images/products` vieram do Unsplash; os dados de venda são fictícios.
 */
const baseProducts: ProductDetail[] = [
  {
    id: '1',
    name: 'Jaqueta jeans vintage clara',
    price: 159.9,
    coverImageUrl: '/images/products/jaqueta-jeans-vintage.jpg',
    store: { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre', verified: true },
    category: 'Roupas',
    size: 'G',
    color: 'Azul claro',
    brand: 'Vintage',
    condition: 'Usado',
    description:
      'Jaqueta jeans garimpada em brechó, com lavagem azul clara e caimento soltinho. ' +
      'Tem sinais leves de uso no denim, sem rasgos ou manchas.',
    material: 'Denim 100% algodão',
    measurements: 'Ombro a ombro 50cm • Comprimento 62cm',
    status: 'ativo',
    media: [{ type: 'image', url: '/images/products/jaqueta-jeans-vintage.jpg', position: 0 }],
    style: 'vintage-80-90',
  },
  {
    id: '2',
    name: 'Blusa bordada off-white',
    price: 79.9,
    coverImageUrl: '/images/products/blusa-bordada-vintage.jpg',
    store: { id: '2', name: 'Garimpo da Redenção', city: 'Porto Alegre', verified: true },
    category: 'Roupas',
    size: 'M',
    color: 'Off-white',
    brand: 'Sem etiqueta',
    condition: 'Seminovo',
    description:
      'Blusa leve com bordado delicado na frente e mangas curtas. ' +
      'Peça de segunda mão bem conservada, sem avarias aparentes.',
    material: 'Algodão',
    measurements: 'Busto 96cm • Comprimento 58cm',
    status: 'ativo',
    media: [{ type: 'image', url: '/images/products/blusa-bordada-vintage.jpg', position: 0 }],
    style: 'boho-romantico',
  },
  {
    id: '3',
    name: 'Jaqueta biker preta',
    price: 229.9,
    coverImageUrl: '/images/products/jaqueta-biker.jpg',
    store: { id: '3', name: 'Roupa Rodada', city: 'Caxias do Sul', verified: false },
    category: 'Roupas',
    size: 'P',
    color: 'Preto',
    brand: 'Zara',
    condition: 'Seminovo',
    description:
      'Jaqueta biker preta de material sintético, com bolsos de zíper e ferragens em bom estado. ' +
      'Garimpada em brechó e pronta para ganhar mais histórias.',
    material: 'Poliuretano e poliéster',
    measurements: 'Ombro a ombro 42cm • Comprimento 54cm',
    status: 'ativo',
    media: [{ type: 'image', url: '/images/products/jaqueta-biker.jpg', position: 0 }],
    style: 'gotico-dark',
  },
  {
    id: '4',
    name: 'Vestido floral midi',
    price: 149.9,
    coverImageUrl: '/images/products/vestido-floral.jpg',
    store: { id: '4', name: 'Segunda Chance Modas', city: 'Pelotas', verified: true },
    category: 'Roupas',
    size: 'M',
    color: 'Floral em tons de rosa',
    brand: 'Sem etiqueta',
    condition: 'Seminovo',
    description:
      'Vestido midi de estampa floral, com mangas três quartos e cintura confortável. ' +
      'Peça de brechó conservada, sem manchas ou furos.',
    material: 'Viscose',
    measurements: 'Busto 92cm • Comprimento 112cm',
    status: 'vendido',
    media: [{ type: 'image', url: '/images/products/vestido-floral.jpg', position: 0 }],
    style: 'boho-romantico',
  },
  {
    id: '5',
    name: 'Calça jeans reta azul',
    price: 119.9,
    coverImageUrl: '/images/products/calca-jeans.jpg',
    store: { id: '5', name: 'Baú da Vó Nair', city: 'Santa Maria', verified: false },
    category: 'Roupas',
    size: '40',
    color: 'Azul médio',
    brand: "Levi's",
    condition: 'Marcas de uso',
    description:
      'Calça jeans reta de cintura média, com lavagem azul e marcas suaves do uso. ' +
      'Denim firme, sem rasgos e com todos os botões e zíper funcionando.',
    material: 'Denim 100% algodão',
    measurements: 'Cintura 82cm • Comprimento 102cm',
    status: 'ativo',
    media: [{ type: 'image', url: '/images/products/calca-jeans.jpg', position: 0 }],
    style: 'vintage-80-90',
  },
  {
    id: '6',
    name: 'Camisa social branca',
    price: 89.9,
    coverImageUrl: '/images/products/camisa-social.jpg',
    store: { id: '6', name: 'Desapego Serrano', city: 'Gramado', verified: true },
    category: 'Roupas',
    size: 'G',
    color: 'Branco',
    brand: 'Hering',
    condition: 'Seminovo',
    description:
      'Camisa branca de corte clássico, fácil de combinar no trabalho ou no dia a dia. ' +
      'Garimpada em brechó e sem marcas visíveis de desgaste.',
    material: 'Algodão',
    measurements: 'Ombro a ombro 46cm • Comprimento 70cm',
    status: 'ativo',
    media: [{ type: 'image', url: '/images/products/camisa-social.jpg', position: 0 }],
    style: 'alfaiataria',
  },
  {
    id: '7',
    name: 'Jaqueta bomber caramelo',
    price: 139.9,
    coverImageUrl: '/images/products/jaqueta-bomber.jpg',
    store: { id: '7', name: 'Ateliê Reviver', city: 'Canoas', verified: false },
    category: 'Roupas',
    size: 'G',
    color: 'Caramelo',
    brand: 'Vintage',
    condition: 'Seminovo',
    description:
      'Jaqueta bomber leve em tom caramelo, com fechamento frontal e punhos elásticos. ' +
      'Peça de segunda mão em ótimo estado, sem desbotamento aparente.',
    material: 'Poliéster',
    measurements: 'Ombro a ombro 48cm • Comprimento 64cm',
    status: 'ativo',
    media: [{ type: 'image', url: '/images/products/jaqueta-bomber.jpg', position: 0 }],
    style: 'streetwear',
  },
  {
    id: '8',
    name: 'Camiseta gráfica retrô',
    price: 69.9,
    coverImageUrl: '/images/products/camiseta-grafica.jpg',
    store: { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre', verified: true },
    category: 'Roupas',
    size: 'M',
    color: 'Off-white com azul',
    brand: 'Vintage',
    condition: 'Usado',
    description:
      'Camiseta estampada garimpada em brechó, com gola e costuras preservadas. ' +
      'A estampa tem leves sinais do tempo que dão personalidade à peça.',
    material: 'Algodão',
    measurements: 'Ombro a ombro 44cm • Comprimento 68cm',
    status: 'ativo',
    media: [{ type: 'image', url: '/images/products/camiseta-grafica.jpg', position: 0 }],
    style: 'streetwear',
  },
];

const additionalProductSeeds = [
  ['Vestido chemise azul-marinho', 139.9, 'M', 'Azul-marinho', 'Renner', 'vestido-floral.jpg'],
  ['Blazer alfaiataria bege', 189.9, 'G', 'Bege', 'Zara', 'jaqueta-biker.jpg'],
  ['Saia midi plissada vinho', 89.9, 'P', 'Vinho', 'C&A', 'vestido-floral.jpg'],
  ['Cardigã de tricô mostarda', 109.9, 'M', 'Mostarda', 'Hering', 'jaqueta-bomber.jpg'],
  ['Macacão pantacourt preto', 159.9, 'G', 'Preto', 'Amaro', 'vestido-floral.jpg'],
  ['Regata canelada verde-oliva', 39.9, 'P', 'Verde-oliva', 'Youcom', 'blusa-bordada-vintage.jpg'],
  ['Calça pantalona terracota', 99.9, '40', 'Terracota', 'Renner', 'calca-jeans.jpg'],
  ['Suéter gola alta cinza', 119.9, 'M', 'Cinza', 'Hering', 'jaqueta-bomber.jpg'],
  ['Camisa xadrez de flanela', 79.9, 'G', 'Xadrez vermelho', 'Riachuelo', 'camisa-social.jpg'],
  ['Short de linho natural', 69.9, '38', 'Natural', 'Farm', 'calca-jeans.jpg'],
  ['Vestido longo estampado', 169.9, 'M', 'Estampa azul', 'Farm', 'vestido-floral.jpg'],
  ['Cropped de manga bufante', 59.9, 'P', 'Lilás', 'C&A', 'blusa-bordada-vintage.jpg'],
  ['Jaqueta corta-vento roxa', 129.9, 'G', 'Roxo', 'Adidas', 'jaqueta-bomber.jpg'],
  ['Calça de sarja verde', 89.9, '42', 'Verde-militar', 'Hering', 'calca-jeans.jpg'],
  ['Blusa de gola laço', 74.9, 'M', 'Creme', 'Zara', 'camisa-social.jpg'],
  ['Saia jeans com botões', 79.9, '38', 'Azul médio', 'Levi’s', 'calca-jeans.jpg'],
  ['Vestido envelope coral', 119.9, 'G', 'Coral', 'Amaro', 'vestido-floral.jpg'],
  ['Camiseta básica lavanda', 34.9, 'M', 'Lavanda', 'Hering', 'camiseta-grafica.jpg'],
  ['Calça jogger preta', 69.9, 'P', 'Preto', 'Nike', 'calca-jeans.jpg'],
  ['Kimono estampado tropical', 99.9, 'Único', 'Estampa tropical', 'Farm', 'vestido-floral.jpg'],
  ['Polo listrada azul e branca', 64.9, 'G', 'Azul e branco', 'Lacoste', 'camisa-social.jpg'],
  ['Colete de tricô caramelo', 89.9, 'M', 'Caramelo', 'Renner', 'jaqueta-bomber.jpg'],
  ['Bermuda jeans destroyed', 59.9, '40', 'Azul claro', 'Riachuelo', 'calca-jeans.jpg'],
  ['Blusa ombro a ombro floral', 69.9, 'P', 'Floral rosa', 'C&A', 'blusa-bordada-vintage.jpg'],
  ['Vestido tubinho preto', 109.9, 'M', 'Preto', 'Zara', 'vestido-floral.jpg'],
  ['Moletom college verde', 99.9, 'G', 'Verde', 'Adidas', 'camiseta-grafica.jpg'],
  ['Calça clochard listrada', 94.9, '38', 'Listras bege', 'Amaro', 'calca-jeans.jpg'],
  ['Camisa jeans manga curta', 84.9, 'M', 'Índigo', 'Levi’s', 'camisa-social.jpg'],
  ['Saia envelope estampada', 74.9, 'M', 'Estampa azul', 'Farm', 'vestido-floral.jpg'],
  [
    'Jaqueta de sarja verde-musgo',
    149.9,
    'G',
    'Verde-musgo',
    'Hering',
    'jaqueta-jeans-vintage.jpg',
  ],
  ['Blusa manga longa canelada', 54.9, 'P', 'Bordô', 'Renner', 'blusa-bordada-vintage.jpg'],
  ['Calça skinny preta', 99.9, '40', 'Preto', 'Zara', 'calca-jeans.jpg'],
  ['Vestido camisola estampado', 89.9, 'G', 'Estampa floral', 'C&A', 'vestido-floral.jpg'],
  ['Camiseta listrada retrô', 49.9, 'M', 'Listras azul-marinho', 'Vintage', 'camiseta-grafica.jpg'],
  ['Casaco de lã batida', 199.9, 'G', 'Camel', 'Zara', 'jaqueta-bomber.jpg'],
  ['Top de alças acetinado', 64.9, 'P', 'Champanhe', 'Amaro', 'blusa-bordada-vintage.jpg'],
  ['Calça cargo bege', 129.9, '42', 'Bege', 'Riachuelo', 'calca-jeans.jpg'],
  ['Blazer xadrez cinza', 179.9, 'M', 'Xadrez cinza', 'Renner', 'jaqueta-biker.jpg'],
  ['Vestido boho de crochê', 139.9, 'M', 'Cru', 'Farm', 'vestido-floral.jpg'],
  ['Camiseta oversized terracota', 59.9, 'G', 'Terracota', 'Youcom', 'camiseta-grafica.jpg'],
  ['Saia longa jeans', 109.9, '40', 'Azul escuro', 'Levi’s', 'calca-jeans.jpg'],
  ['Camisa de viscose estampada', 79.9, 'M', 'Estampa verde', 'C&A', 'camisa-social.jpg'],
  ['Jaqueta puffer vermelha', 169.9, 'G', 'Vermelho', 'Adidas', 'jaqueta-bomber.jpg'],
  [
    'Regata de seda estampada',
    89.9,
    'P',
    'Estampa geométrica',
    'Zara',
    'blusa-bordada-vintage.jpg',
  ],
  ['Calça reta de alfaiataria', 119.9, '38', 'Grafite', 'Amaro', 'calca-jeans.jpg'],
  ['Vestido de poá preto e branco', 129.9, 'M', 'Poá', 'Renner', 'vestido-floral.jpg'],
  ['Suéter listrado colorido', 94.9, 'G', 'Listras coloridas', 'Hering', 'jaqueta-bomber.jpg'],
  ['Camiseta estampada de banda', 74.9, 'M', 'Preto', 'Vintage', 'camiseta-grafica.jpg'],
  ['Short de cintura alta floral', 59.9, '38', 'Floral amarelo', 'Farm', 'calca-jeans.jpg'],
  ['Blusa peplum azul', 69.9, 'P', 'Azul royal', 'C&A', 'blusa-bordada-vintage.jpg'],
  ['Vestido de malha canelada', 99.9, 'G', 'Verde-sálvia', 'Youcom', 'vestido-floral.jpg'],
  ['Jaqueta jeans oversized', 159.9, 'G', 'Azul índigo', 'Levi’s', 'jaqueta-jeans-vintage.jpg'],
] as const;

const conditions = ['Seminovo', 'Usado', 'Marcas de uso'] as const;
const activeStores = baseProducts.filter((product) => product.status === 'ativo');

/** Os 6 valores de `app/constants/styles.py`, na mesma ordem de rotação de fallback. */
const STYLE_VALUES = [
  'vintage-80-90',
  'streetwear',
  'alfaiataria',
  'gotico-dark',
  'boho-romantico',
  'y2k',
] as const;

/**
 * Classifica o estilo da peça pelo nome (palavras-chave na ordem mais
 * específica primeiro). Sem nenhuma pista no nome, roda entre os 6 valores
 * (índice da peça) garante que todo estilo tem peça suficiente pro
 * `recommendationService` (#313) e pros filtros terem o que mostrar.
 */
function pickStyle(name: string, index: number): (typeof STYLE_VALUES)[number] {
  const lower = name.toLowerCase();

  if (/alfaiataria|blazer|social/.test(lower)) return 'alfaiataria';
  if (/boho|crochê|floral|peplum/.test(lower)) return 'boho-romantico';
  if (/gótico|poá|xadrez/.test(lower)) return 'gotico-dark';
  if (/cropped|pantacourt|baguete|y2k/.test(lower)) return 'y2k';
  if (/oversized|moletom|college|puffer|corta-vento|banda|cargo/.test(lower)) return 'streetwear';
  if (/vintage|jeans|denim|retrô/.test(lower)) return 'vintage-80-90';

  return STYLE_VALUES[index % STYLE_VALUES.length];
}

export const products: ProductDetail[] = [
  ...baseProducts,
  ...additionalProductSeeds.map(
    ([name, price, size, color, brand, image], index): ProductDetail => {
      const imageUrl = `/images/products/${image}`;
      const store = activeStores[index % activeStores.length].store;

      return {
        id: String(baseProducts.length + index + 1),
        name,
        price,
        coverImageUrl: imageUrl,
        store,
        category: 'Roupas',
        size,
        color,
        brand,
        condition: conditions[index % conditions.length],
        description: 'Peça de segunda mão em bom estado, pronta para ganhar novas histórias.',
        status: 'ativo',
        media: [{ type: 'image', url: imageUrl, position: 0 }],
        style: pickStyle(name, index),
      };
    },
  ),
];
