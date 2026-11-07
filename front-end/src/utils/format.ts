/**
 * Formatação de texto compartilhada entre telas. Só apresentação.
 *
 * Existe para o produto contar peça de um jeito só: a home dizia
 * "7 peças encontradas" e o catálogo "7 resultado(s)" — duas palavras para a
 * mesma coisa, e uma delas com o plural entre parênteses, que é a marca de
 * texto que ninguém escreveu de propósito.
 */
export function formatPieceCount(total: number): string {
  return total === 1 ? '1 peça' : `${total} peças`;
}

/**
 * Formata um valor em centavos como moeda BR: 123456 -> "R$ 1.234,56".
 * Usa `toLocaleString` só para o agrupamento de milhar do inteiro (não usa
 * `Intl.NumberFormat` com `style: 'currency'` de propósito: essa API insere
 * um espaço non-breaking (U+00A0) depois de "R$" em vez de espaço normal,
 * o que quebra comparação exata de string nos testes e fica inconsistente
 * visualmente).
 */
export function formatCentsToBRL(cents: number): string {
  const safeCents = Math.max(0, Math.trunc(cents));
  const reais = Math.floor(safeCents / 100);
  const centavos = safeCents % 100;
  return `R$ ${reais.toLocaleString('pt-BR')},${String(centavos).padStart(2, '0')}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const clockFormat = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function agoLabel(count: number, one: string, many: string): string {
  return `há ${count} ${count === 1 ? one : many}`;
}

/** Tempo decorrido: "há 12 minutos", "há 1 hora", "há 3 dias". `now` existe para os testes. */
export function formatTimeAgo(iso: string, now: number = Date.now()): string {
  const elapsed = now - new Date(iso).getTime();
  if (elapsed < MINUTE_MS) return 'há menos de 1 minuto';
  if (elapsed < HOUR_MS) return agoLabel(Math.floor(elapsed / MINUTE_MS), 'minuto', 'minutos');
  if (elapsed < DAY_MS) return agoLabel(Math.floor(elapsed / HOUR_MS), 'hora', 'horas');
  return agoLabel(Math.floor(elapsed / DAY_MS), 'dia', 'dias');
}

/** Hora de uma data ISO: "14:32". */
export function formatClock(iso: string): string {
  return clockFormat.format(new Date(iso));
}

/** Data e hora de uma data ISO: "01/10/2026 às 14:32". */
export function formatDateTime(iso: string): string {
  return `${dateFormat.format(new Date(iso))} às ${formatClock(iso)}`;
}
