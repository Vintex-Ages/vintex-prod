/**
 * Tipos do domínio "Vintex AI" (assistente de curadoria de looks).
 *
 * Contrato provisório: ainda não existe um backend de IA definido para o
 * projeto (IA vive em repositório separado — ver README, seção "Escopo").
 * Este arquivo documenta o formato que `vintexAiService` — e, futuramente,
 * a API real — deve respeitar. Ajustar quando o contrato do backend for
 * definido.
 */

export type ChatRole = 'user' | 'vintex';

export type OutfitItemIcon = 'shirt' | 'pants' | 'bag';

export interface OutfitItem {
  id: string;
  label: string;
  /**
   * Ícone de categoria usado como placeholder visual da peça, enquanto não
   * há um serviço/CDN real de imagens de produto.
   */
  icon: OutfitItemIcon;
}

export interface OutfitSuggestion {
  title: string;
  description: string;
  items: OutfitItem[];
  note: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  timestamp: string;
  text: string;
  /** Presente apenas em mensagens da Vintex que trazem uma sugestão de look. */
  outfit?: OutfitSuggestion;
}
