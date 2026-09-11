import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import AuthHeader from '@/components/auth/AuthHeader';
import AuthTabs from '@/components/auth/AuthTabs';
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
    <main className="min-h-screen bg-papel">
      <AuthHeader onBack={() => navigate(-1)} />

      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
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
            <p role="alert" className="text-label text-vermelho-escuro">
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
            className="text-label text-tinta underline"
          >
            Esqueceu sua senha?
          </a>

          <Button type="submit" variant="primary" fullWidth>
            Entrar
          </Button>
        </form>
      </div>
    </main>
  );
}

export default Login;
