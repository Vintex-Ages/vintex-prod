import type { ProductDetail } from '@/types/product';

/**
 * 8 peças fixas cobrindo feed, detalhe e filtros. Lojas e cidades do RS
 * espelham `app/seeds/lojas.py` do back (BE-SEED-1) para a review mostrar a
 * mesma coisa nas duas pontas; imagens seguem o mesmo placeholder do seed de
 * peças (`app/seeds/pecas.py`, BE-SEED-2).
 *
 * `description` (texto corrido, estilo "história da peça"), `material` e
 * `measurements` são conteúdo inventado pra FE-US012-1 — não fazem parte do
 * contrato confirmado do back (ver nota em `types/product.ts`).
 */
export const products: ProductDetail[] = [
  {
    id: '1',
    name: 'Nike Camiseta Preto',
    price: 79.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-1-0/600/800',
    store: { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre', verified: true },
    category: 'Roupas',
    size: 'M',
    color: 'Preto',
    brand: 'Nike',
    condition: 'Seminovo',
    description:
      'Peça garimpada no Mercado Público de Porto Alegre, direto de um lote de básicos pouco usados. ' +
      'Malha 100% algodão, sem manchas ou furos, estampa ainda firme. ' +
      'Um coringa pra qualquer produção, do dia a dia ao rolê.',
    material: '100% algodão',
    measurements: 'Ombro a ombro 44cm • Comprimento 68cm',
    status: 'ativo',
    media: [
      { type: 'image', url: 'https://picsum.photos/seed/vintex-1-0/600/800', position: 0 },
      { type: 'image', url: 'https://picsum.photos/seed/vintex-1-1/600/800', position: 1 },
      { type: 'image', url: 'https://picsum.photos/seed/vintex-1-2/600/800', position: 2 },
    ],
  },
  {
    id: '2',
    name: "Levi's Jaqueta Azul",
    price: 189.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-2-0/600/800',
    store: { id: '2', name: 'Garimpo da Redenção', city: 'Porto Alegre', verified: true },
    category: 'Roupas',
    size: 'G',
    color: 'Azul',
    brand: "Levi's",
    condition: 'Usado',
    description:
      'Clássica trucker jacket, achada numa feira de trocas na Redenção. ' +
      'Jeans grosso, boa densidade, com a maciez que só o uso de verdade proporciona. ' +
      'Marcas leves de desgaste no punho, sem comprometer nada.',
    material: '100% algodão (denim)',
    measurements: 'Ombro a ombro 50cm • Comprimento 62cm',
    status: 'ativo',
    media: [
      { type: 'image', url: 'https://picsum.photos/seed/vintex-2-0/600/800', position: 0 },
      { type: 'image', url: 'https://picsum.photos/seed/vintex-2-1/600/800', position: 1 },
    ],
  },
  {
    id: '3',
    name: 'Adidas Tênis Branco',
    price: 229.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-3-0/600/800',
    store: { id: '3', name: 'Roupa Rodada', city: 'Caxias do Sul', verified: false },
    category: 'Sapatos',
    size: '40',
    color: 'Branco',
    brand: 'Adidas',
    condition: 'Novo com etiqueta',
    description:
      'Par novo, nunca usado — sobra de estoque de uma loja que fechou em Caxias do Sul. ' +
      'Etiqueta e caixa original inclusas. ' +
      'Solado intacto, sem sinal de uso nem armazenamento incorreto.',
    material: 'Cabedal sintético, solado de borracha',
    measurements: 'Numeração 40 (BR)',
    status: 'ativo',
    media: [{ type: 'image', url: 'https://picsum.photos/seed/vintex-3-0/600/800', position: 0 }],
  },
  {
    id: '4',
    name: 'Zara Vestido Estampado',
    price: 149.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-4-0/600/800',
    store: { id: '4', name: 'Segunda Chance Modas', city: 'Pelotas', verified: true },
    category: 'Roupas',
    size: 'P',
    color: 'Estampado',
    brand: 'Zara',
    condition: 'Seminovo',
    description:
      'Vestido leve de estampa floral, usado só uma vez num casamento em Pelotas. ' +
      'Tecido fluido, caimento solto, sem transparência. ' +
      'Forro interno intacto, zíper lateral funcionando perfeitamente.',
    material: 'Viscose com forro de poliéster',
    measurements: 'Busto 88cm • Comprimento 94cm',
    status: 'vendido',
    media: [{ type: 'image', url: 'https://picsum.photos/seed/vintex-4-0/600/800', position: 0 }],
  },
  {
    id: '5',
    name: 'Farm Bolsa Bege',
    price: 99.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-5-0/600/800',
    store: { id: '5', name: 'Baú da Vó Nair', city: 'Santa Maria', verified: false },
    category: 'Acessórios',
    size: 'M',
    color: 'Bege',
    brand: 'Farm',
    condition: 'Marcas de uso',
    description:
      'Bolsa de couro sintético que já rodou bastante, com a personalidade de quem foi bem usada. ' +
      'Marcas leves de uso no fundo e nas alças, forro interno em bom estado. ' +
      'Fecho magnético funcionando, bolso interno com zíper intacto.',
    material: 'Couro sintético',
    measurements: 'Largura 32cm • Altura 24cm • Alça 60cm',
    status: 'ativo',
    media: [{ type: 'image', url: 'https://picsum.photos/seed/vintex-5-0/600/800', position: 0 }],
  },
  {
    id: '6',
    name: 'Osklen Bota Preto',
    price: 259.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-6-0/600/800',
    store: { id: '6', name: 'Desapego Serrano', city: 'Gramado', verified: true },
    category: 'Sapatos',
    size: '38',
    color: 'Preto',
    brand: 'Osklen',
    condition: 'Usado',
    description:
      'Bota de couro legítimo, comprada em Gramado e usada em poucos invernos. ' +
      'Couro macio com pátina natural, sola em bom estado sem desgaste irregular. ' +
      'Cadarços e ilhoses originais, sem trocas.',
    material: '100% couro bovino',
    measurements: 'Numeração 38 (BR) • Cano 18cm',
    status: 'ativo',
    media: [{ type: 'image', url: 'https://picsum.photos/seed/vintex-6-0/600/800', position: 0 }],
  },
  {
    id: '7',
    name: 'Hering Moletom Verde',
    price: 119.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-7-0/600/800',
    store: { id: '7', name: 'Ateliê Reviver', city: 'Canoas', verified: false },
    category: 'Roupas',
    size: 'GG',
    color: 'Verde',
    brand: 'Hering',
    condition: 'Seminovo',
    description:
      'Moletom felpado, ideal pros dias frios do RS. ' +
      'Cor verde musgo sem desbotamento, felpa interna ainda macia. ' +
      'Punhos e barra com elasticidade preservada, sem bolinhas de uso.',
    material: '80% algodão, 20% poliéster',
    measurements: 'Ombro a ombro 56cm • Comprimento 72cm',
    status: 'ativo',
    media: [{ type: 'image', url: 'https://picsum.photos/seed/vintex-7-0/600/800', position: 0 }],
  },
  {
    id: '8',
    name: 'Lacoste Boné Vermelho',
    price: 69.9,
    coverImageUrl: 'https://picsum.photos/seed/vintex-8-0/600/800',
    store: { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre', verified: true },
    category: 'Acessórios',
    size: 'M',
    color: 'Vermelho',
    brand: 'Lacoste',
    condition: 'Novo com etiqueta',
    description:
      'Boné novo, nunca usado, ainda com a etiqueta original presa. ' +
      'Estrutura firme, aba reta, fivela de ajuste traseira sem folga. ' +
      'Bordado do jacaré intacto, sem sinais de manuseio.',
    material: 'Sarja de algodão',
    measurements: 'Ajustável — circunferência 54 a 60cm',
    status: 'ativo',
    media: [{ type: 'image', url: 'https://picsum.photos/seed/vintex-8-0/600/800', position: 0 }],
  },
];
