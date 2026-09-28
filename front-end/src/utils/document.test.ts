import { describe, expect, it } from 'vitest';
import {
  formatCep,
  formatCnpj,
  formatCpf,
  formatDocument,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  onlyDigits,
} from './document';

describe('onlyDigits', () => {
  it('remove tudo que não é dígito', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
    expect(onlyDigits('abc')).toBe('');
  });
});

describe('formatCpf', () => {
  it('aplica a máscara 000.000.000-00 conforme a digitação avança', () => {
    expect(formatCpf('529')).toBe('529');
    expect(formatCpf('5299')).toBe('529.9');
    expect(formatCpf('5299822')).toBe('529.982.2');
    expect(formatCpf('529982247')).toBe('529.982.247');
    expect(formatCpf('5299822472')).toBe('529.982.247-2');
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
  });

  it('ignora o que não é dígito e corta em 11 dígitos', () => {
    expect(formatCpf('529.982.247-25999')).toBe('529.982.247-25');
    expect(formatCpf('')).toBe('');
  });
});

describe('formatCnpj', () => {
  it('aplica a máscara 00.000.000/0000-00 conforme a digitação avança', () => {
    expect(formatCnpj('11')).toBe('11');
    expect(formatCnpj('112')).toBe('11.2');
    expect(formatCnpj('112223')).toBe('11.222.3');
    expect(formatCnpj('112223330')).toBe('11.222.333/0');
    expect(formatCnpj('1122233300018')).toBe('11.222.333/0001-8');
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('corta em 14 dígitos', () => {
    expect(formatCnpj('11.222.333/0001-8199')).toBe('11.222.333/0001-81');
  });
});

describe('formatDocument', () => {
  it('escolhe a máscara pelo tipo', () => {
    expect(formatDocument('cpf', '52998224725')).toBe('529.982.247-25');
    expect(formatDocument('cnpj', '11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('isValidCpf (RN-30)', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each([
    ['dígito verificador errado', '529.982.247-24'],
    ['segundo dígito errado', '111.444.777-36'],
    ['dígitos repetidos', '111.111.111-11'],
    ['incompleto', '529.982.247'],
    ['vazio', ''],
    ['comprido demais', '529982247251'],
  ])('recusa CPF com %s', (_motivo, cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });
});

describe('isValidCnpj (RN-30)', () => {
  it.each(['11.222.333/0001-81', '11222333000181', '60.701.190/0001-04'])('aceita %s', (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true);
  });

  it.each([
    ['dígito verificador errado', '11.222.333/0001-82'],
    ['primeiro dígito errado', '11.222.333/0001-91'],
    ['dígitos repetidos', '00.000.000/0000-00'],
    ['incompleto', '11.222.333/0001'],
    ['vazio', ''],
  ])('recusa CNPJ com %s', (_motivo, cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(false);
  });
});

describe('isValidDocument', () => {
  it('valida pelo tipo escolhido — um CPF válido não passa como CNPJ', () => {
    expect(isValidDocument('cpf', '529.982.247-25')).toBe(true);
    expect(isValidDocument('cnpj', '529.982.247-25')).toBe(false);
    expect(isValidDocument('cnpj', '11.222.333/0001-81')).toBe(true);
    expect(isValidDocument('cpf', '11.222.333/0001-81')).toBe(false);
  });
});

describe('formatCep', () => {
  it('aplica a máscara 00000-000 e corta em 8 dígitos', () => {
    expect(formatCep('90035')).toBe('90035');
    expect(formatCep('900350')).toBe('90035-0');
    expect(formatCep('90035072')).toBe('90035-072');
    expect(formatCep('90035-07299')).toBe('90035-072');
  });
});
