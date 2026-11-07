import { describe, expect, it } from 'vitest';
import type {
  ChatChunk,
  ChatMessage,
  ChatRole,
  InterpretedQuery,
  OutfitItem,
  OutfitItemIcon,
  OutfitSuggestion,
} from './vintex-ai';
import type { Product } from './product';

/**
 * Estes testes existem principalmente para travar o formato dos tipos:
 * se alguém remover ou renomear um campo obrigatório, o `tsc --noEmit`
 * (e o build) já falham por causa dos literais tipados abaixo, antes
 * mesmo de qualquer asserção em runtime rodar.
 */
describe('vintex-ai types', () => {
  it('aceita o formato de OutfitItem para os três ícones suportados', () => {
    const icons: OutfitItemIcon[] = ['shirt', 'pants', 'bag'];

    const items: OutfitItem[] = icons.map((icon, index) => ({
      id: `item-${index}`,
      label: `Peça ${index}`,
      icon,
    }));

    expect(items.map((item) => item.icon)).toEqual(icons);
  });

  it('aceita o formato de OutfitSuggestion', () => {
    const suggestion: OutfitSuggestion = {
      title: 'Domingo de garimpo',
      description: 'Uma composição leve para circular pela cidade.',
      items: [{ id: 'i1', label: 'Camisa leve', icon: 'shirt' }],
      note: 'Conteúdo sintético para visualizar a ideia.',
    };

    expect(suggestion.items).toHaveLength(1);
  });

  it('aceita ChatMessage para os dois papéis (user/vintex), com createdAt (#199)', () => {
    const roles: ChatRole[] = ['user', 'vintex'];

    const messages: ChatMessage[] = roles.map((role) => ({
      id: `msg-${role}`,
      role,
      createdAt: new Date().toISOString(),
      text: 'texto de exemplo',
    }));

    expect(messages.map((message) => message.role)).toEqual(roles);
  });

  it('ChatMessage aceita outfit, products e interpreted, todos opcionais e coexistindo', () => {
    const product: Product = {
      id: 'p1',
      name: 'Camiseta',
      price: 79.9,
      coverImageUrl: null,
      store: { id: 's1', name: 'Brechó' },
    };

    const message: ChatMessage = {
      id: 'msg-outfit',
      role: 'vintex',
      createdAt: new Date().toISOString(),
      text: 'texto de exemplo',
      outfit: {
        title: 'Domingo de garimpo',
        description: 'desc',
        items: [{ id: 'i1', label: 'Camisa leve', icon: 'shirt' }],
        note: 'nota',
      },
      products: [product],
      interpreted: { filters: { category: 'Roupas' }, similarity: 'básico' },
    };

    expect(message.outfit?.items).toHaveLength(1);
    expect(message.products).toHaveLength(1);
    expect(message.interpreted?.filters.category).toBe('Roupas');
  });

  it('InterpretedQuery aceita filters sem similarity (busca 100% objetiva)', () => {
    const interpreted: InterpretedQuery = { filters: { color: 'Preto', size: 'M' } };

    expect(interpreted.similarity).toBeUndefined();
  });

  it('ChatChunk cobre os cinco tipos de evento do streaming', () => {
    const product: Product = {
      id: 'p1',
      name: 'Camiseta',
      price: 79.9,
      coverImageUrl: null,
      store: { id: 's1', name: 'Brechó' },
    };

    const chunks: ChatChunk[] = [
      { type: 'text', delta: 'Ent' },
      { type: 'products', products: [product] },
      { type: 'interpreted', interpreted: { filters: {} } },
      { type: 'done' },
      { type: 'error', message: 'falhou' },
    ];

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'text',
      'products',
      'interpreted',
      'done',
      'error',
    ]);
  });
});
