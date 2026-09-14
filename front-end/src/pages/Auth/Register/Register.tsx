import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import Checkbox from '@/components/common/Checkbox';
import IconButton from '@/components/common/IconButton';
import InputField from '@/components/common/InputField';
import { useAuth } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { register } from '@/services/authService';
import { CepError, lookupAddress, type CepAddress } from '@/services/cepService';
import { REDIRECT_STORAGE_KEY } from '@/services/httpClient';
import type { ApiError } from '@/types/auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_ERROR_MESSAGE =
  'A senha precisa ter ao menos 8 caracteres, incluindo uma letra e um número.';

/** Espelha a política do backend (`isPasswordValid` em `authService`): mín. 8, 1 letra + 1 número. */
function isPasswordValid(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

type CepStatus = 'idle' | 'loading' | 'resolved' | 'not_found' | 'error';
type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'cep' | 'terms', string>>;

/** `12345678` → `12345-678`; mantém só dígitos, no máximo 8. */
function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  );
}

/** Impede o link de navegar e de repassar o clique pro checkbox (ver JSDoc de `Checkbox`). */
function preventLinkActivation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

/** Origem enviada via `location.state.from` (ex.: link de "Já tenho conta" clicado a partir de uma ação protegida). */
function getStateReturnTo(locationState: unknown): string | null {
  return (locationState as { from?: string } | null)?.from ?? null;
}

/** `true` quando existe uma origem pendente em `sessionStorage`, sem consumi-la. */
function hasStoredReturnTo(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * Tela de cadastro de comprador (FE-US002-1). Monta os componentes de
 * formulário; a chamada de cadastro vive em `authService`, a resolução de
 * endereço por CEP em `cepService` (só exibição — não integra o payload).
 *
 * Quando o cadastro é iniciado a partir de uma ação protegida (FE-US002-3),
 * ao concluir com sucesso o fluxo retorna para a origem preservada em vez de
 * seguir para o onboarding.
 *
 * `useAuth().login()` (#65, barreira de autenticação) já resolve sozinho o
 * caso da origem guardada em `sessionStorage[REDIRECT_STORAGE_KEY]`: navega
 * pra lá (ou pra Home, na ausência dela) e limpa a chave. Esta tela só precisa
 * *sobrescrever* esse destino quando: (a) a origem veio por
 * `location.state.from` (que `login()` não enxerga) ou (b) não havia origem
 * nenhuma — cadastro "orgânico", que deve cair no onboarding e não na Home.
 *
 * Usage:
 *   import Register from '@/pages/Auth/Register/Register';
 *   <Route path={paths.register} element={<Register />} />
 */
function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cep, setCep] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');
  const [cepAddress, setCepAddress] = useState<CepAddress | null>(null);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Resolve o CEP assim que os 8 dígitos são digitados; não envia nada ao back.
  useEffect(() => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepStatus('idle');
      setCepAddress(null);
      return;
    }

    let active = true;
    setCepStatus('loading');

    lookupAddress(digits)
      .then((address) => {
        if (!active) return;
        setCepAddress(address);
        setCepStatus(address ? 'resolved' : 'not_found');
      })
      .catch((error) => {
        if (!active) return;
        setCepAddress(null);
        setCepStatus('error');
        if (!(error instanceof CepError)) throw error;
      });

    return () => {
      active = false;
    };
  }, [cep]);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = 'Informe seu nome completo.';
    if (!EMAIL_PATTERN.test(email)) errors.email = 'Informe um e-mail válido.';
    if (!isPasswordValid(password)) {
      errors.password = PASSWORD_ERROR_MESSAGE;
    }
    if (cepStatus !== 'resolved') errors.cep = 'Informe um CEP válido.';
    if (!termsAccepted) errors.terms = 'É preciso aceitar os termos para continuar.';
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const { user, access_token: token } = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });

      // Captura ANTES de login(): a própria chamada consome (lê e remove)
      // a chave de sessionStorage como parte do seu fluxo de redirecionamento.
      const stateReturnTo = getStateReturnTo(location.state);
      const hadStoredReturnTo = hasStoredReturnTo();

      login(user, token);

      if (stateReturnTo) {
        // `login()` não conhece location.state; navega por cima do destino que ela aplicou.
        navigate(stateReturnTo, { replace: true });
      } else if (!hadStoredReturnTo) {
        // Nada pendente em nenhuma fonte: login() foi para a Home por padrão,
        // mas o cadastro "orgânico" deve seguir para o onboarding.
        navigate(paths.onboarding, { replace: true });
      }
      // else: havia origem em sessionStorage e login() já navegou pra lá — não mexe.
    } catch (error) {
      // authService rejeita com ApiError puro (não uma classe de erro), ver @/types/auth.
      const apiError = error as Partial<ApiError> | undefined;
      const message =
        typeof apiError?.message === 'string'
          ? apiError.message
          : 'Não foi possível criar sua conta agora.';

      // Erro com `field` (ex.: EMAIL_TAKEN) vai pro campo certo, igual o Input já
      // sabe exibir; sem `field`, cai no banner genérico do formulário.
      if (apiError?.field) {
        const field = apiError.field;
        setFieldErrors((previous) => ({ ...previous, [field]: message }));
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const cepHelperText =
    cepStatus === 'loading'
      ? 'Buscando endereço...'
      : cepStatus === 'not_found'
        ? 'CEP não encontrado.'
        : cepStatus === 'error'
          ? 'Não foi possível consultar o CEP agora.'
          : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="relative flex items-center justify-center border-b border-linha bg-papel-profundo px-4 py-4">
        <div className="absolute left-4">
          <IconButton
            icon={<BackIcon />}
            ariaLabel="Voltar"
            onClick={() => navigate(-1)}
            variant="primary"
          />
        </div>
        <span className="font-display text-h2 text-tinta">Vintex</span>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 bg-white px-4 py-8">
        <h1 className="font-display text-h2 text-tinta">Entre na sua conta</h1>
        <p className="mt-2 text-body text-texto-auxiliar">
          Garimpe peças exclusivas ou desapegue do seu armário
        </p>

        <div className="mt-6 flex border-b border-linha">
          <span
            aria-current="page"
            className="flex-1 bg-tinta py-3 text-center text-label font-bold text-branco-quente"
          >
            CRIAR CONTA
          </span>
          <Link
            to={paths.login}
            className="flex-1 py-3 text-center text-label font-bold text-texto-auxiliar hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            JÁ TENHO CONTA
          </Link>
        </div>

        <form className="mt-6 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <InputField
            id="name"
            label="Nome completo"
            placeholder="Ex: Helena Souza"
            value={name}
            onChange={setName}
            error={fieldErrors.name}
            disabled={submitting}
          />
          <InputField
            id="email"
            label="E-mail"
            type="email"
            placeholder="seuemail@exemplo.com"
            value={email}
            onChange={setEmail}
            error={fieldErrors.email}
            disabled={submitting}
          />
          <InputField
            id="phone"
            label="Telefone celular com DDD"
            type="tel"
            placeholder="(51) 99999-0000"
            value={phone}
            onChange={setPhone}
            disabled={submitting}
          />
          <div>
            <InputField
              id="cep"
              label="CEP (auto-preenchimento)"
              placeholder="90035-072"
              value={cep}
              onChange={(value) => setCep(formatCep(value))}
              error={fieldErrors.cep}
              helperText={cepHelperText}
              disabled={submitting}
            />
            {cepStatus === 'resolved' && cepAddress ? (
              <p className="mt-1 text-label text-vermelho-escuro">
                📍 {cepAddress.neighborhood}, {cepAddress.city} — {cepAddress.state}
              </p>
            ) : null}
          </div>
          <InputField
            id="password"
            label="Senha"
            type="password"
            placeholder="Mínimo de 8 caracteres"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            disabled={submitting}
          />

          <div>
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onChange={setTermsAccepted}
              disabled={submitting}
              label={
                <>
                  Li e aceito os{' '}
                  <a
                    href="#"
                    onClick={preventLinkActivation}
                    className="font-bold text-vermelho-escuro underline"
                  >
                    Termos de Uso
                  </a>{' '}
                  e a{' '}
                  <a
                    href="#"
                    onClick={preventLinkActivation}
                    className="font-bold text-vermelho-escuro underline"
                  >
                    Política de Privacidade
                  </a>{' '}
                  da Vintex.
                </>
              }
            />
            {fieldErrors.terms ? (
              <p role="alert" className="mt-1 text-label text-vermelho-escuro">
                {fieldErrors.terms}
              </p>
            ) : null}
          </div>

          {submitError ? (
            <p role="alert" className="text-body text-vermelho-escuro">
              {submitError}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={submitting}
            className="uppercase tracking-wide"
          >
            {submitting ? 'Criando conta...' : 'Criar conta e personalizar estilos'}
          </Button>
        </form>
      </main>
    </div>
  );
}

export default Register;
