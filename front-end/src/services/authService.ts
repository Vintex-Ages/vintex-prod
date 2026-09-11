import { httpClient } from '@/services/httpClient';
import type { ApiError, AuthUser, RegisterPayload, RegisterResult } from '@/types/auth';

/**
 * Service de autenticação (FE-SVC-auth) — cadastro de comprador (FE-US002-1).
 * Nenhuma tela chama o httpClient direto (`.ai/coding-rules.md`); erros
 * chegam normalizados em `AuthError`.
 *
 * SUPOSIÇÃO a alinhar com o backend (mesmo aviso de `types/auth.ts`): a
 * resposta de sucesso do `POST /auth/register` traz `user` (`AuthUser`) e
 * `access_token`, e o erro segue o formato flat que o `httpClient` já espera
 * pro 401 (`{ code, message }`, sem envelope `error.*`).
 */

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface RegisterApiResponse {
  user: AuthUser;
  access_token: string;
}

function toAuthError(error: unknown): AuthError {
  const data = (error as { response?: { data?: Partial<ApiError> } }).response?.data;
  if (data?.code) {
    return new AuthError(data.code, data.message ?? 'Erro ao criar a conta.');
  }
  return new AuthError('INTERNAL_ERROR', 'Erro ao criar a conta.');
}

export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  try {
    const { data } = await httpClient.post<RegisterApiResponse>('/auth/register', payload);
    return { user: data.user, token: data.access_token };
  } catch (error) {
    throw toAuthError(error);
  }
}
