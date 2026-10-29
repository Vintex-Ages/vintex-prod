import clsx from 'clsx';

import logoVintex from '@/assets/images/logo-vintex.svg';
import IconButton from '@/components/common/IconButton';

/**
 * Cabeçalho compacto das telas de autenticação — botão de voltar + logo.
 * Só apresentação: sem router aqui, quem usa decide o que `onBack` faz
 * (ex.: `navigate(-1)` na página). Mesmo padrão visual do `Header.tsx` do site
 * (fundo de bloco + divisória inferior), porém mais simples e sem navegação.
 *
 * Usage:
 *   import AuthHeader from '@/components/auth/AuthHeader';
 *   <AuthHeader onBack={() => navigate(-1)} />
 */
export type AuthHeaderProps = {
  onBack: () => void;
};

const ArrowLeftIcon = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

function AuthHeader({ onBack }: AuthHeaderProps) {
  return (
    <header className={clsx('border-b border-linha bg-papel-profundo')}>
      <div
        className={clsx(
          'mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 tablet:px-6 web:px-8',
        )}
      >
        <IconButton icon={ArrowLeftIcon} ariaLabel="Voltar" onClick={onBack} variant="primary" />
        {/* Mesma altura do logo no `Header` do site (20px, o tamanho do design). */}
        <img src={logoVintex} alt="Vintex" className="block h-5 w-auto" />
      </div>
    </header>
  );
}

export default AuthHeader;
