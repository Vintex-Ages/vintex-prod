import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import InputField from '@/components/common/InputField';
import MediaUploader from '@/components/common/MediaUploader';
import Select, { type SelectOption } from '@/components/common/Select';
import TextArea from '@/components/common/TextArea';
import Container from '@/components/layout/Container';
import { DESCRIPTION_MAX_LENGTH, useCreateStore, type CepStatus } from '@/hooks/useCreateStore';
import { paths } from '@/routes/paths';
import type { DocumentType } from '@/utils/document';

const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];
const UF_OPTIONS: SelectOption[] = UFS.map((uf) => ({ value: uf, label: uf }));

const DOCUMENT_OPTIONS: { value: DocumentType; label: string; placeholder: string }[] = [
  { value: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { value: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
];

const CEP_HELPER: Partial<Record<CepStatus, string>> = {
  loading: 'Buscando endereço…',
  error: 'Não foi possível consultar o CEP agora. Preencha o endereço abaixo.',
};

const legendClass = 'mb-4 font-display text-h4 text-tinta';

/**
 * `/sell` — "Quero vender" (FE-US006-1, #212): o comprador logado abre a
 * própria loja. Só apresentação: estado, validação, CEP e envio vivem em
 * `useCreateStore`; as regras de CPF/CNPJ (RN-30), em `utils/document.ts`.
 *
 * Estados: conferindo a loja (carregando), falha na conferência (erro com
 * "tentar de novo"), já tem loja (vai ao painel, P-06) e o formulário — que
 * nasce vazio, com cada campo dizendo o que espera.
 *
 * A rota é protegida por `RequireAuth` em `AppRoutes`; chega-se aqui pelo
 * "Quero vender" do menu da conta (`Header`) e pelo convite da Home logada.
 *
 * FE-US003b-1 (#215, Should) — aceite do contrato de venda: quando existir,
 * entra como um passo ANTES deste formulário (renderizado aqui quando
 * `access === 'ready'` e o contrato ainda não foi aceito), e a versão aceita
 * segue para `createStore` pelo `useCreateStore`. Hoje não bloqueia nada.
 *
 * Usage:
 *   import Sell from '@/pages/Sell/Sell';
 *   <Route path={paths.sell} element={<RequireAuth><Sell /></RequireAuth>} />
 */
function Sell() {
  const {
    access,
    retryAccess,
    values,
    errors,
    cepStatus,
    submitting,
    submitError,
    setField,
    setDocumentType,
    submit,
  } = useCreateStore();

  if (access === 'checking') {
    return (
      <p role="status" className="px-4 py-12 text-center font-ui text-body text-texto-auxiliar">
        Verificando sua loja…
      </p>
    );
  }

  if (access === 'error') {
    return (
      <Container as="main" width="narrow" className="py-8">
        <ErrorState message="Não foi possível verificar sua loja." onRetry={retryAccess} />
      </Container>
    );
  }

  if (access === 'has-store') {
    return <Navigate to={paths.seller} replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  const document = DOCUMENT_OPTIONS.find((option) => option.value === values.documentType)!;

  return (
    <Container as="main" width="narrow" className="py-8 tablet:py-12">
      <h1 className="font-display text-h2 text-tinta">Quero vender</h1>
      <p className="mt-2 font-ui text-body text-texto-auxiliar">
        Abra sua loja na Vintex e comece a anunciar suas peças.
      </p>

      <form className="mt-8 flex flex-col gap-10" onSubmit={handleSubmit} noValidate>
        <fieldset className="flex flex-col gap-5" disabled={submitting}>
          <legend className={legendClass}>Sua loja</legend>
          <InputField
            id="store-name"
            label="Nome da loja"
            placeholder="Ex: Brechó da Ana"
            value={values.name}
            onChange={(value) => setField('name', value)}
            error={errors.name}
            disabled={submitting}
          />
          <TextArea
            id="store-description"
            label="Descrição (opcional)"
            placeholder="Conte o estilo das peças e o que torna seu brechó único."
            value={values.description}
            onChange={(value) => setField('description', value)}
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={submitting}
          />
          <MediaUploader
            id="store-logo"
            label="Logo (opcional)"
            accept="image/*"
            single
            value={values.logo}
            onChange={(items) => setField('logo', items)}
            helperText="Aparece no perfil da sua loja."
            disabled={submitting}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-5" disabled={submitting}>
          <legend className={legendClass}>Documento</legend>
          <div role="radiogroup" aria-label="Tipo de documento" className="flex flex-wrap gap-6">
            {DOCUMENT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="inline-flex min-h-touch cursor-pointer items-center gap-2 font-ui text-body text-tinta"
              >
                <input
                  type="radio"
                  name="document-type"
                  value={option.value}
                  checked={values.documentType === option.value}
                  onChange={() => setDocumentType(option.value)}
                  disabled={submitting}
                  className="h-5 w-5 accent-vermelho-escuro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
                />
                {option.label}
              </label>
            ))}
          </div>
          <InputField
            id="store-document"
            label={`Número do ${document.label}`}
            placeholder={document.placeholder}
            value={values.documentNumber}
            onChange={(value) => setField('documentNumber', value)}
            error={errors.documentNumber}
            helperText="Usado só para verificar a loja. Não aparece para compradores."
            disabled={submitting}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-5" disabled={submitting}>
          <legend className={legendClass}>Endereço</legend>
          <InputField
            id="store-cep"
            label="CEP"
            placeholder="00000-000"
            value={values.cep}
            onChange={(value) => setField('cep', value)}
            error={errors.cep}
            helperText={CEP_HELPER[cepStatus]}
            disabled={submitting}
          />
          <InputField
            id="store-street"
            label="Rua"
            value={values.street}
            onChange={(value) => setField('street', value)}
            error={errors.street}
            disabled={submitting}
          />
          <div className="grid grid-cols-2 gap-4">
            <InputField
              id="store-number"
              label="Número"
              value={values.number}
              onChange={(value) => setField('number', value)}
              error={errors.number}
              disabled={submitting}
            />
            <InputField
              id="store-complement"
              label="Complemento"
              placeholder="Opcional"
              value={values.complement}
              onChange={(value) => setField('complement', value)}
              disabled={submitting}
            />
          </div>
          <InputField
            id="store-district"
            label="Bairro"
            value={values.district}
            onChange={(value) => setField('district', value)}
            error={errors.district}
            disabled={submitting}
          />
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <InputField
                id="store-city"
                label="Cidade"
                value={values.city}
                onChange={(value) => setField('city', value)}
                error={errors.city}
                disabled={submitting}
              />
            </div>
            <Select
              id="store-state"
              label="UF"
              placeholder="—"
              options={UF_OPTIONS}
              value={values.state}
              onChange={(value) => setField('state', value)}
              error={errors.state}
              disabled={submitting}
            />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-5" disabled={submitting}>
          <legend className={legendClass}>Recebimento</legend>
          <InputField
            id="store-pix"
            label="Chave Pix"
            placeholder="E-mail, telefone, CPF/CNPJ ou chave aleatória"
            value={values.pixKey}
            onChange={(value) => setField('pixKey', value)}
            error={errors.pixKey}
            helperText="É para onde vai o valor das suas vendas."
            disabled={submitting}
          />
        </fieldset>

        <div className="flex flex-col gap-4">
          {submitError ? (
            <p
              role="alert"
              className="border border-vermelho-escuro bg-vermelho-suave px-4 py-3 text-body-sm text-vermelho-escuro"
            >
              {submitError}
            </p>
          ) : null}

          <Button type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? 'Abrindo sua loja…' : 'Abrir minha loja'}
          </Button>
        </div>
      </form>
    </Container>
  );
}

export default Sell;
