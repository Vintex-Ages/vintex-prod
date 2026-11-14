export interface StyleOption {
  type: string;
  value: string;
  label: string;
  /**
   * Linha de apoio sob o nome do estilo, desenhada no Figma (nó 491:728).
   * `GET /api/styles` já devolve o campo; opcional para não quebrar dado antigo.
   */
  description?: string;
}

export interface Preference {
  type: string;
  value: string;
}
