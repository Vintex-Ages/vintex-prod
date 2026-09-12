import { describe, expect, it } from 'vitest';
import type {
  ChatMessage,
  ChatRole,
  OutfitItem,
  OutfitItemIcon,
  OutfitSuggestion,
} from './vintex-ai';

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

  it('aceita ChatMessage para os dois papéis (user/vintex), com outfit opcional', () => {
    const roles: ChatRole[] = ['user', 'vintex'];

    const messages: ChatMessage[] = roles.map((role) => ({
      id: `msg-${role}`,
      role,
      timestamp: 'agora',
      text: 'texto de exemplo',
    }));

    const messageWithOutfit: ChatMessage = {
      id: 'msg-outfit',
      role: 'vintex',
      timestamp: 'agora',
      text: 'texto de exemplo',
      outfit: {
        title: 'Domingo de garimpo',
        description: 'desc',
        items: [{ id: 'i1', label: 'Camisa leve', icon: 'shirt' }],
        note: 'nota',
      },
    };

    expect(messages.map((message) => message.role)).toEqual(roles);
    expect(messageWithOutfit.outfit?.items).toHaveLength(1);
  });
});
