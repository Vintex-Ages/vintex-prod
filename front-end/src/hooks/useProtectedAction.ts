import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { REDIRECT_STORAGE_KEY } from '@/services/httpClient';
import { AUTH_REQUIRED } from '@/types/auth';

/**
 * Chave usada para manter o fluxo interrompido durante a autenticação.
 */
export const PENDING_ACTION_STORAGE_KEY = 'vintex.auth.pendingAction';

export type ProtectedActionIntent = {
  /**
   * Identificador estável da intenção.
   * Exemplos: `favorite`, `follow-store`, `buy`.
   */
  type: string;

  /**
   * Dados necessários para identificar a ação interrompida.
   */
  payload?: Record<string, unknown>;
};

/**
 * Fluxo protegido interrompido por falta de autenticação.
 */
export type PendingProtectedAction = {
  /** Página em que a ação foi iniciada. */
  returnTo: string;

  /** Ação que deverá ser retomada quando possível. */
  intent: ProtectedActionIntent;
};

type UseProtectedActionOptions = {
  /** Identifica a ação protegida. */
  intent: ProtectedActionIntent;

  /** Executa a ação efetiva quando existe uma sessão válida. */
  action: () => void | Promise<void>;
};

type UseProtectedActionResult = {
  /** Indica se a barreira de autenticação deve ser exibida. */
  interceptorOpen: boolean;

  /** Executa ou interrompe a ação conforme o estado de autenticação. */
  runProtectedAction: () => Promise<void>;

  /** Fecha a barreira e cancela a intenção pendente. */
  dismissInterceptor: () => void;

  /** Encaminha o usuário para login. */
  goToLogin: () => void;

  /** Encaminha o usuário para cadastro. */
  goToRegister: () => void;
};

/**
 * Compara duas intenções protegidas.
 *
 * O tipo e o payload identificam qual ação deve ser retomada.
 */
function isSameIntent(first: ProtectedActionIntent, second: ProtectedActionIntent): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/**
 * Lê com segurança a ação protegida armazenada na sessão.
 */
function getPendingAction(): PendingProtectedAction | null {
  try {
    const stored = window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    return JSON.parse(stored) as PendingProtectedAction;
  } catch {
    return null;
  }
}

/**
 * Remove os dados utilizados pelo fluxo de ação protegida.
 */
function clearPendingAction(): void {
  try {
    window.sessionStorage.removeItem(PENDING_ACTION_STORAGE_KEY);

    window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  } catch {
    // Storage indisponível: não há limpeza adicional possível.
  }
}

/**
 * Verifica se uma falha corresponde ao contrato
 * `401 AUTH_REQUIRED` devolvido pelo backend.
 *
 * O hook não depende diretamente do Axios: apenas verifica a estrutura
 * mínima necessária para reconhecer o erro de autenticação.
 */
function isAuthRequiredError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false;
  }

  const response = (
    error as {
      response?: {
        status?: number;
        data?: {
          error?: {
            code?: string;
          };
        };
      };
    }
  ).response;

  return response?.status === 401 && response.data?.error?.code === AUTH_REQUIRED;
}

/**
 * Controla uma ação que exige autenticação.
 *
 * Quando o usuário está deslogado, origem e intenção são preservadas e a
 * barreira é aberta.
 *
 * Quando existe sessão, a intenção também é salva antes da ação efetiva.
 * Isso permite recuperar o fluxo caso o token esteja expirado e a API
 * responda com `401 AUTH_REQUIRED`.
 *
 * Depois de um novo login, ao retornar para a mesma origem, o hook encontra
 * a intenção pendente e tenta executar a ação novamente.
 *
 * O componente visual continua sem conhecer regras de autenticação:
 * `LoginInterceptor` apenas recebe as propriedades retornadas pelo hook.
 *
 * Usage:
 *   const protectedFavorite = useProtectedAction({
 *     intent: {
 *       type: 'favorite',
 *       payload: { productId: product.id },
 *     },
 *     action: () => favoriteProduct(product.id),
 *   });
 *
 *   <FavoriteButton
 *     active={favorite}
 *     onToggle={protectedFavorite.runProtectedAction}
 *   />
 */
export function useProtectedAction({
  intent,
  action,
}: UseProtectedActionOptions): UseProtectedActionResult {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [interceptorOpen, setInterceptorOpen] = useState(false);

  /**
   * Impede que o mesmo fluxo pendente seja retomado mais de uma vez
   * simultaneamente durante o mesmo ciclo de montagem.
   */
  const resumingRef = useRef(false);

  const getReturnTo = useCallback(
    () => location.pathname + location.search,
    [location.pathname, location.search],
  );

  /**
   * Persiste a origem e a intenção.
   *
   * `REDIRECT_STORAGE_KEY` informa para onde o fluxo de autenticação deve
   * retornar. `PENDING_ACTION_STORAGE_KEY` informa qual ação deve ser
   * retomada quando aquela página for montada novamente.
   */
  const storePendingAction = useCallback(() => {
    const returnTo = getReturnTo();

    const pendingAction: PendingProtectedAction = {
      returnTo,
      intent,
    };

    try {
      window.sessionStorage.setItem(PENDING_ACTION_STORAGE_KEY, JSON.stringify(pendingAction));

      window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, returnTo);
    } catch {
      // Sem storage, a autenticação funciona, mas o fluxo não pode ser retomado.
    }
  }, [getReturnTo, intent]);

  /**
   * Executa a ação efetiva mantendo a intenção disponível até sabermos
   * que a chamada terminou com sucesso.
   *
   * Em `401 AUTH_REQUIRED`, os dados permanecem armazenados para que o
   * httpClient envie o usuário ao login e a ação seja retomada depois.
   *
   * Outros erros não representam interrupção por autenticação, portanto
   * a intenção é descartada antes de propagar a falha.
   */
  const executeAction = useCallback(async () => {
    try {
      await action();
      clearPendingAction();
    } catch (error) {
      if (isAuthRequiredError(error)) {
        return;
      }

      clearPendingAction();
      throw error;
    }
  }, [action]);

  /**
   * Ao clicar:
   * - deslogado: preserva o fluxo e abre a barreira;
   * - autenticado: preserva temporariamente o fluxo e executa a ação.
   *
   * Salvar a intenção também no segundo caso cobre sessões expiradas:
   * caso a API responda `401 AUTH_REQUIRED`, a ação poderá ser retomada.
   */
  const runProtectedAction = useCallback(async () => {
    storePendingAction();

    if (!isAuthenticated) {
      setInterceptorOpen(true);
      return;
    }

    await executeAction();
  }, [executeAction, isAuthenticated, storePendingAction]);

  /**
   * "Agora não" cancela o fluxo protegido.
   *
   * Além de fechar o modal, remove origem e intenção para impedir que uma
   * autenticação futura retome uma ação que o usuário decidiu cancelar.
   */
  const dismissInterceptor = useCallback(() => {
    clearPendingAction();
    setInterceptorOpen(false);
  }, []);

  const goToLogin = useCallback(() => {
    const from = getReturnTo();

    setInterceptorOpen(false);

    navigate(paths.login, {
      state: { from },
    });
  }, [getReturnTo, navigate]);

  const goToRegister = useCallback(() => {
    const from = getReturnTo();

    setInterceptorOpen(false);

    navigate(paths.register, {
      state: { from },
    });
  }, [getReturnTo, navigate]);

  /**
   * Retoma a ação quando:
   * - a restauração da sessão terminou;
   * - o usuário está autenticado;
   * - voltou exatamente para a rota de origem;
   * - a intenção registrada por este hook é a intenção pendente.
   *
   * A intenção permanece armazenada durante a execução. Ela só é removida
   * depois de sucesso, permitindo novo login caso a sessão ainda seja inválida.
   */
  useEffect(() => {
    if (loading || !isAuthenticated || resumingRef.current) {
      return;
    }

    const pendingAction = getPendingAction();

    if (!pendingAction) {
      return;
    }

    if (pendingAction.returnTo !== getReturnTo()) {
      return;
    }

    if (!isSameIntent(pendingAction.intent, intent)) {
      return;
    }

    resumingRef.current = true;

    void executeAction().finally(() => {
      resumingRef.current = false;
    });
  }, [executeAction, getReturnTo, intent, isAuthenticated, loading]);

  return {
    interceptorOpen,
    runProtectedAction,
    dismissInterceptor,
    goToLogin,
    goToRegister,
  };
}
