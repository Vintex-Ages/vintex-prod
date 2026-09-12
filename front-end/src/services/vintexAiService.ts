import type { ChatMessage } from '@/types/vintex-ai';

/**
 * Camada de acesso à IA da Vintex (curadoria de looks a partir de um prompt
 * em texto livre).
 *
 * Hoje devolve uma resposta mockada e determinística (não há backend de IA
 * definido ainda). Quando ele existir, trocar
 * o corpo desta função pela chamada real via `httpClient`
 * (`src/services/httpClient.ts`), mantendo a mesma assinatura
 * (`prompt: string => Promise<ChatMessage>`) para não quebrar quem já
 * consome o service, por exemplo:
 *
 *   const { data } = await httpClient.post<ChatMessage>(
 *     '/vintex-ai/suggestions',
 *     { prompt },
 *   );
 *   return data;
 */
export async function getOutfitSuggestion(prompt: string): Promise<ChatMessage> {
  // O mock ignora o conteúdo do prompt por enquanto; a IA real vai usá-lo
  // para gerar a sugestão.
  void prompt;

  return {
    id: crypto.randomUUID(),
    role: 'vintex',
    timestamp: 'agora',
    text: 'Entendi: confortável, com memória de brechó e uma base fácil de usar. Montei uma primeira combinação com contraste baixo e uma textura para dar personalidade.',
    outfit: {
      title: 'Domingo de garimpo',
      description: 'Uma composição leve para circular pela cidade e ainda render um achado.',
      items: [
        { id: 'i1', label: 'Camisa leve', icon: 'shirt' },
        { id: 'i2', label: 'Jeans reto', icon: 'pants' },
        { id: 'i3', label: 'Bolsa de couro', icon: 'bag' },
      ],
      note: 'Conteúdo sintético para visualizar a ideia. A curadoria real poderá cruzar suas preferências com peças disponíveis.',
    },
  };
}
