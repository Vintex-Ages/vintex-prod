/**
 * Documento do vendedor (RN-30) — máscara e validação de CPF e CNPJ, e a
 * máscara de CEP usada nos formulários de endereço.
 *
 * Funções puras, sem React: a regra fica aqui, testada isoladamente
 * (`document.test.ts`), e a tela só chama. A validação confere o dígito
 * verificador, não só o tamanho — `111.111.111-11` tem 11 dígitos e passa no
 * cálculo, por isso sequências repetidas são recusadas à parte.
 *
 * Validar aqui não substitui a validação do back: é só para o erro aparecer no
 * campo antes do envio.
 *
 * Usage:
 *   import { formatDocument, isValidDocument } from '@/utils/document';
 *   const masked = formatDocument('cpf', '52998224725'); // '529.982.247-25'
 *   if (!isValidDocument('cpf', masked)) setErro('CPF inválido.');
 */

export type DocumentType = 'cpf' | 'cnpj';

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Aplica `pattern` (onde `0` é um dígito) aos dígitos de `value`, parando no
 * último dígito digitado — sem pontuação sobrando no fim enquanto a pessoa
 * ainda está digitando.
 */
function applyMask(value: string, pattern: string): string {
  const digits = onlyDigits(value);
  let result = '';
  let next = 0;

  for (const char of pattern) {
    if (next >= digits.length) break;
    if (char === '0') {
      result += digits[next];
      next += 1;
    } else {
      result += char;
    }
  }

  return result;
}

/** `52998224725` → `529.982.247-25`. */
export function formatCpf(value: string): string {
  return applyMask(value, '000.000.000-00');
}

/** `11222333000181` → `11.222.333/0001-81`. */
export function formatCnpj(value: string): string {
  return applyMask(value, '00.000.000/0000-00');
}

export function formatDocument(type: DocumentType, value: string): string {
  return type === 'cpf' ? formatCpf(value) : formatCnpj(value);
}

/** `90035072` → `90035-072`. */
export function formatCep(value: string): string {
  return applyMask(value, '00000-000');
}

/** Todos os dígitos iguais passam no cálculo do verificador, mas não são documento real. */
function isRepeatedSequence(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

/**
 * Dígito verificador no módulo 11: soma dos dígitos vezes os pesos; resto
 * menor que 2 vira 0, senão `11 - resto`. É a mesma conta para CPF e CNPJ, só
 * mudam os pesos.
 */
function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== CPF_LENGTH || isRepeatedSequence(digits)) return false;

  const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(digits[9]) && second === Number(digits[10]);
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== CNPJ_LENGTH || isRepeatedSequence(digits)) return false;

  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(digits[12]) && second === Number(digits[13]);
}

export function isValidDocument(type: DocumentType, value: string): boolean {
  return type === 'cpf' ? isValidCpf(value) : isValidCnpj(value);
}
