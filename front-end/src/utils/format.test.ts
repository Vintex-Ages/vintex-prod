import { describe, expect, it } from 'vitest';
import { formatClock, formatDateTime, formatTimeAgo } from './format';

const NOW = new Date('2026-10-01T15:00:00.000Z').getTime();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('formatTimeAgo', () => {
  it('menos de um minuto', () => {
    expect(formatTimeAgo(minutesAgo(0), NOW)).toBe('há menos de 1 minuto');
  });

  it('minutos, no singular e no plural', () => {
    expect(formatTimeAgo(minutesAgo(1), NOW)).toBe('há 1 minuto');
    expect(formatTimeAgo(minutesAgo(12), NOW)).toBe('há 12 minutos');
  });

  it('horas, no singular e no plural', () => {
    expect(formatTimeAgo(minutesAgo(60), NOW)).toBe('há 1 hora');
    expect(formatTimeAgo(minutesAgo(5 * 60 + 30), NOW)).toBe('há 5 horas');
  });

  it('dias, no singular e no plural', () => {
    expect(formatTimeAgo(minutesAgo(24 * 60), NOW)).toBe('há 1 dia');
    expect(formatTimeAgo(minutesAgo(3 * 24 * 60), NOW)).toBe('há 3 dias');
  });

  it('data no futuro (relógios diferentes) conta como menos de um minuto', () => {
    expect(formatTimeAgo(minutesAgo(-5), NOW)).toBe('há menos de 1 minuto');
  });
});

describe('formatClock / formatDateTime', () => {
  it('formata a hora como HH:mm', () => {
    expect(formatClock('2026-10-01T14:32:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('formata a data e a hora em português', () => {
    expect(formatDateTime('2026-10-01T14:32:00.000Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/,
    );
  });
});
