import { afterEach, describe, expect, it } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { httpClient } from '@/services/httpClient';
import type { RegisterPayload } from '@/types/auth';
import { AuthError, register } from './authService';

/** Adapter falso: registra a config final e responde com o corpo dado. */
function successAdapter(store: { config?: InternalAxiosRequestConfig }, data: unknown) {
  return (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    store.config = config;
    return Promise.resolve({ data, status: 201, statusText: 'Created', headers: {}, config });
  };
}

/** Adapter falso: sempre rejeita com o corpo de erro dado. */
function errorAdapter(status: number, data: unknown) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
        data,
        status,
        statusText: 'Error',
        headers: {},
        config,
      }),
    );
}

const PAYLOAD: RegisterPayload = {
  name: 'Ana Compradora',
  email: 'ana@exemplo.com',
  password: 'senha1234',
  phone: '51999990000',
};

describe('authService', () => {
  afterEach(() => {
    httpClient.defaults.adapter = undefined;
  });

  describe('register', () => {
    it('envia o payload para POST /auth/register e mapeia user + token', async () => {
      const store: { config?: InternalAxiosRequestConfig } = {};
      httpClient.defaults.adapter = successAdapter(store, {
        user: { id: 'u_1', name: 'Ana Compradora', email: 'ana@exemplo.com' },
        access_token: 'tok-abc',
      });

      const result = await register(PAYLOAD);

      expect(store.config?.url).toBe('/auth/register');
      expect(store.config?.method).toBe('post');
      expect(JSON.parse(store.config?.data as string)).toEqual(PAYLOAD);
      expect(result).toEqual({
        user: { id: 'u_1', name: 'Ana Compradora', email: 'ana@exemplo.com' },
        token: 'tok-abc',
      });
    });

    it('envia sem phone quando ele não é informado', async () => {
      const store: { config?: InternalAxiosRequestConfig } = {};
      httpClient.defaults.adapter = successAdapter(store, {
        user: { id: 'u_1', name: 'Ana Compradora', email: 'ana@exemplo.com' },
        access_token: 'tok-abc',
      });
      const payloadSemTelefone: RegisterPayload = {
        name: PAYLOAD.name,
        email: PAYLOAD.email,
        password: PAYLOAD.password,
      };

      await register(payloadSemTelefone);

      expect(JSON.parse(store.config?.data as string)).toEqual(payloadSemTelefone);
    });

    it('rejeita com AuthError quando o back devolve um erro com code/message', async () => {
      httpClient.defaults.adapter = errorAdapter(409, {
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Este e-mail já está cadastrado.',
      });

      await expect(register(PAYLOAD)).rejects.toMatchObject({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Este e-mail já está cadastrado.',
      });
      await expect(register(PAYLOAD)).rejects.toBeInstanceOf(AuthError);
    });

    it('rejeita com AuthError genérico quando o back não devolve code', async () => {
      httpClient.defaults.adapter = errorAdapter(500, {});

      await expect(register(PAYLOAD)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });
});
