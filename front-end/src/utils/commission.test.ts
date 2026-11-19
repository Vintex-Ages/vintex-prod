import { describe, expect, it } from 'vitest';
import { netValue } from './commission';

describe('netValue', () => {
  it('aplica a comissão padrão de 9% (RN-11): preço 100 -> comissão 9, líquido 91', () => {
    const price = 100;
    const net = netValue(price);

    expect(net).toBe(91);
    expect(price - net).toBe(9);
  });

  it('aceita outra taxa', () => {
    expect(netValue(200, 0.1)).toBe(180);
  });

  it('calcula em centavos, sem erro de ponto flutuante', () => {
    // Em float, 19.9 * 0.91 = 18.108999999999998.
    expect(netValue(19.9)).toBe(18.11);
    // 0.1 + 0.2 não é 0.3 em float; em centavos o resultado fecha.
    expect(netValue(0.1 + 0.2)).toBe(0.27);
  });

  it('arredonda para 2 casas decimais', () => {
    // 9% de R$ 10,05 = 90,45 centavos -> 90 centavos; líquido 915 centavos.
    expect(netValue(10.05)).toBe(9.15);
  });

  it('preço zero devolve zero', () => {
    expect(netValue(0)).toBe(0);
  });
});
