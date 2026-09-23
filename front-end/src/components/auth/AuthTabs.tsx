import clsx from 'clsx';
import { Link } from 'react-router-dom';

import { paths } from '@/routes/paths';

/**
 * AuthTabs — par de abas lado a lado (padrão segmented control / tab bar) que
 * alterna entre as telas de cadastro e login. Só apresentação: navega por rota
 * com o `Link` do `react-router-dom`, sem estado nem regra de negócio — ver
 * `.ai/coding-rules.md`.
 *
 * A aba indicada por `active` recebe `aria-current="page"` e o estilo ativo
 * (fundo `tinta`, texto `branco-quente`); a outra usa fundo `papel`/texto
 * `tinta` com borda inferior sinalizando que não está selecionada.
 *
 * Usage:
 *   import AuthTabs from '@/components/auth/AuthTabs';
 *   <AuthTabs active="login" />
 */
export type AuthTabsProps = {
  /** Aba em destaque; recebe `aria-current="page"` e o estilo ativo. */
  active: 'login' | 'register';
};

function tabClass(isActive: boolean): string {
  return clsx(
    'flex min-h-11 flex-1 items-center justify-center px-4 text-body font-semibold no-underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tinta',
    isActive
      ? 'bg-tinta text-branco-quente'
      : 'border-b-2 border-linha bg-papel text-tinta hover:bg-papel-profundo',
  );
}

function AuthTabs({ active }: AuthTabsProps) {
  return (
    <div className={clsx('flex')}>
      <Link
        to={paths.register}
        className={tabClass(active === 'register')}
        aria-current={active === 'register' ? 'page' : undefined}
      >
        Criar conta
      </Link>
      <Link
        to={paths.login}
        className={tabClass(active === 'login')}
        aria-current={active === 'login' ? 'page' : undefined}
      >
        Já tenho conta
      </Link>
    </div>
  );
}

export default AuthTabs;
