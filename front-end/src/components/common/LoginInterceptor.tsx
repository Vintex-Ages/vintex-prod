import Button from './Button';
import Dialog from './Dialog';

export type LoginInterceptorProps = {
  open: boolean;
  title: string;
  description: string;
  onLogin: () => void;
  onRegister: () => void;
  onDismiss: () => void;
};

const actionClassName = 'font-semibold';

/**
 * Overlay que interrompe uma ação que exige login (FE-US001-2, FE-US012-5).
 * Só apresentação: quem decide abrir é o hook `useProtectedAction`, este
 * componente só reage à prop `open`. Foco preso, ESC e `aria-modal` vêm do
 * `Dialog` (FE-CMP-28); clicar fora não fecha, como antes da extração.
 *
 * Usage:
 *   import LoginInterceptor from '@/components/common/LoginInterceptor';
 *   <LoginInterceptor
 *     open={bloqueado}
 *     title="Entre para salvar seus favoritos"
 *     description="Faça login para favoritar peças, acompanhar a disponibilidade e receber alertas."
 *     onLogin={irParaLogin}
 *     onRegister={irParaCadastro}
 *     onDismiss={() => setBloqueado(false)}
 *   />
 */
function LoginInterceptor({
  open,
  title,
  description,
  onLogin,
  onRegister,
  onDismiss,
}: LoginInterceptorProps) {
  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      title={title}
      description={<p>{description}</p>}
      closeOnBackdrop={false}
      footer={
        <div className="flex flex-col gap-3 web:flex-row web:flex-wrap">
          <Button
            variant="primary"
            onClick={onLogin}
            className={`${actionClassName} web:order-2 web:flex-1`}
          >
            Entrar
          </Button>
          <Button
            variant="outline"
            onClick={onRegister}
            className={`${actionClassName} web:order-1 web:flex-1`}
          >
            Criar conta
          </Button>
          <Button
            variant="secondary"
            onClick={onDismiss}
            className={`${actionClassName} font-bold web:order-3 web:basis-full`}
          >
            Agora não
          </Button>
        </div>
      }
    />
  );
}

export default LoginInterceptor;
