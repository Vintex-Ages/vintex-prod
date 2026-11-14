import type { SuspendedProduct } from '@/types/adminModeration';
import type { ProductStatus } from '@/types/product';

/** Insumo sintético do mock; images permite reproduzir a validação do publish. */
export interface MockModerationProduct extends SuspendedProduct {
  images: string[];
}

function product(id: string, name: string, status: ProductStatus): MockModerationProduct {
  const image = `https://images.example.test/moderation/${id}.jpg`;
  return {
    id,
    name,
    status,
    price: 90,
    coverImageUrl: image,
    store: { id: '800', name: 'Brechó de demonstração' },
    images: [image],
  };
}

// Autor histórico da fixture, não uma conta ou sessão de autenticação.
const moderation = {
  moderationReason: 'Fotos não correspondem à peça de demonstração.',
  moderatedAt: '2026-11-10T12:00:00',
  moderatedBy: { id: '900', name: 'Moderadora de demonstração' },
};

/** Seeds próprios: o service copia estes dados antes de qualquer operação. */
export const products: MockModerationProduct[] = [
  product('1', 'Jaqueta de demonstração', 'ativo'),
  { ...product('2', 'Vestido suspenso', 'despublicado'), ...moderation },
  product('3', 'Camisa pausada pelo vendedor', 'despublicado'),
  product('4', 'Bolsa reservada', 'reservado'),
  product('5', 'Calça vendida', 'vendido'),
  {
    ...product('6', 'Peça suspensa sem foto', 'despublicado'),
    ...moderation,
    images: [],
    coverImageUrl: null,
  },
  { ...product('7', 'Rascunho de demonstração', 'rascunho'), images: [], coverImageUrl: null },
];
