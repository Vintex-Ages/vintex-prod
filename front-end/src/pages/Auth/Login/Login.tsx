import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import AuthHeader from '@/components/auth/AuthHeader';
import AuthTabs from '@/components/auth/AuthTabs';
import Container from '@/components/layout/Container';
import Button from '@/components/common/Button';
import InputField from '@/components/common/InputField';
import { useAuth } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { login as authLogin } from '@/services/authService';
import type { ApiError } from '@/types/auth';

/**
 * Página de login (FE-US005-1, issue #73).
 *
 * Compõe o cabeçalho e as abas de autenticação com um formulário de e-mail e
 * senha. Ela só orquestra: no envio delega a `login` de `@/services/authService`
 * e, no sucesso, grava a sessão via `useAuth().login` e redireciona — para a
 * rota de origem (`location.state.from`, quando existir) ou para `paths.home`.
 * No erro, mostra a `message` do `ApiError` (ver `@/types/auth`) num aviso
 * genérico, sem indicar qual campo falhou, e permanece na página.
 *
 * Não há validação de formato no cliente: envia o que o usuário digitou e deixa
 * a decisão para o service/backend.
 *
 * Usage:
 *   import Login from '@/pages/Auth/Login/Login';
 *   <Route path={paths.login} element={<Login />} />
 */
function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: registrarSessao } = useAuth();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    try {
      const { user, access_token } = await authLogin({ email, password: senha });
      registrarSessao(user, access_token);

      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? paths.home);
    } catch (error) {
      // `authService.login` sempre rejeita no formato `ApiError` de `@/types/auth`.
      setErro((error as ApiError).message);
    }
  }

  return (
    // O cabecalho fica FORA do <main>: um landmark `banner` dentro do `main`
    // deixa a pagina sem um conteudo principal inequivoco. Mesma montagem do
    // cadastro, para as duas telas do par serem a mesma tela.
    <div className="flex min-h-screen flex-col bg-papel">
      <AuthHeader onBack={() => navigate(-1)} />

      <Container as="main" width="narrow" className="flex flex-1 flex-col gap-6 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-h2 text-tinta">Entre na Vintex</h1>
          <p className="text-body text-texto-auxiliar">
            Garimpe peças exclusivas ou desapegue do seu armário
          </p>
        </div>

        <AuthTabs active="login" />

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <InputField id="email" label="E-mail" type="email" value={email} onChange={setEmail} />
          <InputField id="senha" label="Senha" type="password" value={senha} onChange={setSenha} />

          {erro ? (
            <p
              role="alert"
              className="border border-vermelho-escuro bg-vermelho-suave px-4 py-3 text-body-sm text-vermelho-escuro"
            >
              {erro}
            </p>
          ) : null}

          {/*
            TODO: ainda não existe issue de recuperação de senha no projeto, então
            este link é estático de propósito e não navega para lugar nenhum.
          */}
          <a
            href="#"
            onClick={(event) => event.preventDefault()}
            className="w-fit text-body-sm text-texto-auxiliar underline underline-offset-4 hover:text-vermelho-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
          >
            Esqueceu sua senha?
          </a>

          <Button type="submit" variant="primary" fullWidth>
            Entrar
          </Button>
        </form>
      </Container>
    </div>
  );
}

export default Login;
