import axios from 'axios';
import { AUTH_REQUIRED, type ApiError, type AuthUser, type LoginInput, type RegisterInput } from '@/types/auth';
import { httpClient } from './httpClient';

/**
 * Service de autenticação (FE-SVC-auth, issue #103).
 *
 * Expõe as quatro operações do fluxo de conta — `register`, `login`, `logout` e
 * `me` — para as telas e para o `AuthContext`, escondendo de quem chama se a
 * origem dos dados é um mock em memória ou a API real. O retorno é sempre no
 * formato que o front consome (`AuthUser` com `id: string` e papéis booleanos);
 * erros são sempre `ApiError` de `@/types/auth`, nunca `AxiosError` cru.
 *
 * FLAG `VITE_USE_MOCKS` (`import.meta.env.VITE_USE_MOCKS`, ver `.env.example`):
 *   - ausente ou `'true'` → usa o mock em memória deste módulo (default de dev,
 *     permite tocar o fluxo sem backend de pé);
 *   - `'false'` → usa a API real via `httpClient` (`POST /auth/register`,
 *     `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; a `baseURL` e o
 *     header `Authorization` já vêm do `httpClient`).
 *   A leitura acontece uma única vez, em tempo de import do módulo: as funções
 *   exportadas já ficam ligadas à implementação escolhida. Trocar de modo em
 *   teste exige `vi.stubEnv` + `vi.resetModules()` + reimport.
 *
 * SUPOSIÇÕES a alinhar com o time de backend (não há contrato formal publicado —
 * ver a mesma ressalva em `@/types/auth`):
 *   - o código de erro de senha fora da política é assumido como
 *     `'INVALID_PASSWORD'` (usado só no mock; a política em si — mín. 8 caracteres
 *     com ao menos 1 letra e 1 número — também é suposição);
 *   - o erro genérico/desconhecido da API real é repassado como veio (`code` e
 *     `message` do corpo); quando o corpo não traz `code`, usa-se o fallback
 *     `'API_ERROR'` e nenhum `field` é inventado;
 *   - `register` e `login` da API real devolvem `user` sem `is_seller` (só
 *     `is_admin`); assume-se `is_seller: false` nesses dois casos e considera-se
 *     que apenas `GET /auth/me` devolve `is_seller` de verdade;
 *   - o backend envia `user.id` numérico; a conversão para `string` é feita aqui.
 *
 * Usage:
 *   import { register, login, logout, me } from '@/services/authService';
 *
 *   const { user, access_token } = await login({ email, password });
 *   // ...guardar o token e o usuário no AuthContext...
 *   const atual = await me(); // rejeita com ApiError { code: AUTH_REQUIRED } sem sessão
 */

/** Retorno das operações que abrem sessão (`register` e `login`). */
export interface AuthResult {
  user: AuthUser;
  access_token: string;
}

/** Código de erro (suposição) para senha que não cumpre a política mínima. */
const INVALID_PASSWORD = 'INVALID_PASSWORD';
/** Código de erro para e-mail já cadastrado. */
const EMAIL_TAKEN = 'EMAIL_TAKEN';
/** Código de erro para par e-mail/senha inválido (mensagem única, sem `field`). */
const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
/** Código genérico quando a API real não devolve um `code` no corpo. */
const GENERIC_API_ERROR = 'API_ERROR';

/** `true` quando o módulo deve operar sobre o mock em memória. */
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

// ---------------------------------------------------------------------------
// Modo MOCK — estado só em memória, reiniciado a cada import do módulo.
// ---------------------------------------------------------------------------

interface MockAccount {
  user: AuthUser;
  /** Senha em texto puro: o mock também só vive em memória, não há o que proteger. */
  password: string;
}

/** Contas cadastradas no mock, indexadas por e-mail. */
const mockAccounts = new Map<string, MockAccount>();
/** E-mail da sessão ativa no mock, ou `null` quando ninguém está logado. */
let mockCurrentEmail: string | null = null;
/** Sequência para gerar ids estáveis dentro de uma execução. */
let mockIdSeq = 0;

/** Política de senha assumida: mín. 8 caracteres, com ao menos 1 letra e 1 número. */
function isPasswordValid(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

function makeMockToken(userId: string): string {
  return `mock.${userId}.${Date.now().toString(36)}`;
}

function rejectApiError(error: ApiError): Promise<never> {
  return Promise.reject(error);
}

async function mockRegister(input: RegisterInput): Promise<AuthResult> {
  if (!isPasswordValid(input.password)) {
    return rejectApiError({
      code: INVALID_PASSWORD,
      field: 'password',
      message: 'A senha precisa ter ao menos 8 caracteres, incluindo uma letra e um número.',
    });
  }

  if (mockAccounts.has(input.email)) {
    return rejectApiError({
      code: EMAIL_TAKEN,
      field: 'email',
      message: 'Este e-mail já está cadastrado.',
    });
  }

  const user: AuthUser = {
    id: String(++mockIdSeq),
    name: input.name,
    email: input.email,
    is_seller: false,
    is_admin: false,
  };
  mockAccounts.set(input.email, { user, password: input.password });
  mockCurrentEmail = input.email;

  return { user, access_token: makeMockToken(user.id) };
}

async function mockLogin(input: LoginInput): Promise<AuthResult> {
  const account = mockAccounts.get(input.email);
  // Mesmo erro (mesma mensagem, sem `field`) para e-mail inexistente e senha
  // errada: não revelar qual dos dois falhou.
  if (!account || account.password !== input.password) {
    return rejectApiError({
      code: INVALID_CREDENTIALS,
      message: 'E-mail ou senha inválidos.',
    });
  }

  mockCurrentEmail = input.email;
  return { user: account.user, access_token: makeMockToken(account.user.id) };
}

async function mockLogout(): Promise<void> {
  mockCurrentEmail = null;
}

async function mockMe(): Promise<AuthUser> {
  const account = mockCurrentEmail ? mockAccounts.get(mockCurrentEmail) : undefined;
  if (!account) {
    return rejectApiError({
      code: AUTH_REQUIRED,
      message: 'É necessário estar autenticado.',
    });
  }
  return account.user;
}

// ---------------------------------------------------------------------------
// Modo API REAL — via httpClient; mapeia o corpo do backend para o front.
// ---------------------------------------------------------------------------

/** Forma do `user` como o backend devolve (id numérico, `is_seller` opcional). */
interface ApiUser {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  is_seller?: boolean;
}

interface ApiAuthResponse {
  user: ApiUser;
  access_token: string;
}

/** Converte o `user` do backend para `AuthUser`, forçando o `is_seller` informado. */
function toAuthUser(apiUser: ApiUser, isSeller: boolean): AuthUser {
  return {
    id: String(apiUser.id),
    name: apiUser.name,
    email: apiUser.email,
    is_admin: apiUser.is_admin,
    is_seller: isSeller,
  };
}

/** Normaliza qualquer erro de transporte para o `ApiError` do front. */
function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const body = (error.response?.data ?? {}) as Partial<ApiError>;
    const code = typeof body.code === 'string' && body.code.length > 0 ? body.code : GENERIC_API_ERROR;
    const message =
      typeof body.message === 'string' && body.message.length > 0 ? body.message : error.message;

    // Só o e-mail duplicado ganha um `field`; os demais códigos (inclusive
    // INVALID_CREDENTIALS) saem com `field: undefined` — sem pista de campo,
    // mas com a forma do objeto estável para quem consome.
    if (code === EMAIL_TAKEN) {
      return { code, message, field: 'email' };
    }
    return { code, message, field: undefined };
  }

  return {
    code: GENERIC_API_ERROR,
    message: error instanceof Error ? error.message : 'Falha inesperada na requisição.',
    field: undefined,
  };
}

async function apiRegister(input: RegisterInput): Promise<AuthResult> {
  try {
    const { data } = await httpClient.post<ApiAuthResponse>('/auth/register', input);
    return { user: toAuthUser(data.user, false), access_token: data.access_token };
  } catch (error) {
    throw toApiError(error);
  }
}

async function apiLogin(input: LoginInput): Promise<AuthResult> {
  try {
    const { data } = await httpClient.post<ApiAuthResponse>('/auth/login', input);
    return { user: toAuthUser(data.user, false), access_token: data.access_token };
  } catch (error) {
    throw toApiError(error);
  }
}

async function apiLogout(): Promise<void> {
  try {
    await httpClient.post('/auth/logout');
  } catch (error) {
    throw toApiError(error);
  }
}

async function apiMe(): Promise<AuthUser> {
  try {
    const { data } = await httpClient.get<ApiUser>('/auth/me');
    return toAuthUser(data, Boolean(data.is_seller));
  } catch (error) {
    throw toApiError(error);
  }
}

// ---------------------------------------------------------------------------
// Seleção do modo — resolvida uma vez, no import do módulo.
// ---------------------------------------------------------------------------

/** Cria a conta, abre a sessão e devolve o usuário + token de acesso. */
export const register: (input: RegisterInput) => Promise<AuthResult> = useMocks
  ? mockRegister
  : apiRegister;

/** Autentica com e-mail e senha e devolve o usuário + token de acesso. */
export const login: (input: LoginInput) => Promise<AuthResult> = useMocks ? mockLogin : apiLogin;

/** Encerra a sessão atual. Sempre resolve. */
export const logout: () => Promise<void> = useMocks ? mockLogout : apiLogout;

/** Devolve o usuário da sessão atual; rejeita com `ApiError { code: AUTH_REQUIRED }` sem sessão. */
export const me: () => Promise<AuthUser> = useMocks ? mockMe : apiMe;
