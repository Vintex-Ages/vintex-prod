/**
 * FooterLink — texto auxiliar + link de ação, usado para alternar entre telas
 * relacionadas (ex.: login/cadastro). Somente apresentação: sem chamada HTTP,
 * sem validação de tela — ver `.ai/coding-rules.md`.
 *
 * Uso:
 *   <FooterLink text="Não tem uma conta?" linkLabel="Criar conta" to="/signup" />
 *   <FooterLink text="Já tem conta?" linkLabel="Entrar" onClick={() => setMode('login')} />
 */
interface FooterLinkProps {
  /** Texto auxiliar exibido antes do link. */
  text: string;
  /** Rótulo do link/ação clicável. */
  linkLabel: string;
  /** Rota de destino. Renderiza um <a> — o app ainda não tem router montado (#106). */
  to?: string;
  /** Disparado no clique quando `to` não é informado (ex.: alternar estado local). */
  onClick?: () => void;
}

export function FooterLink({ text, linkLabel, to, onClick }: FooterLinkProps) {
  const linkClass =
    'font-ui text-body font-bold text-vermelho-escuro no-underline bg-transparent border-0 p-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro';

  return (
    <p className="font-ui text-body text-texto-auxiliar flex items-center justify-center gap-1">
      {text}
      {to ? (
        <a href={to} className={linkClass}>
          {linkLabel}
        </a>
      ) : (
        <button type="button" onClick={onClick} className={linkClass}>
          {linkLabel}
        </button>
      )}
    </p>
  );
}
