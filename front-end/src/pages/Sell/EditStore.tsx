import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AddressFields from '@/components/common/AddressFields';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import FormErrorSummary from '@/components/common/FormErrorSummary';
import InputField from '@/components/common/InputField';
import MediaUploader from '@/components/common/MediaUploader';
import TextArea from '@/components/common/TextArea';
import Container from '@/components/layout/Container';
import { useToast } from '@/context/useToast';
import { DESCRIPTION_MAX_LENGTH } from '@/hooks/useCreateStore';
import { useEditStore } from '@/hooks/useEditStore';
import { paths } from '@/routes/paths';
import type { StoreAddress } from '@/types/store';

const legendClass = 'mb-2 font-display text-h4 text-tinta';

/**
 * "Editar loja" (FE-US006-4, #335), em `/seller/store`, aberta pelo painel do
 * vendedor. Não há tela de edição no Figma: é o formulário de criação da loja
 * (`Sell`) com os valores atuais preenchidos e o documento visível e travado.
 *
 * O envio é parcial (back-end#221): salvar só a logo não apaga descrição,
 * endereço nem chave Pix, e salvar sem mudar nada não chama a API. A regra
 * mora em `useEditStore`; aqui só se desenha e se decide o aviso.
 *
 * Usage:
 *   <Route path={paths.sellerStore} element={<RequireStore><EditStore /></RequireStore>} />
 */
function EditStore() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    state,
    retry,
    values,
    errors,
    cepStatus,
    submitting,
    submitError,
    documentLabel,
    documentNumber,
    setField,
    submit,
  } = useEditStore();
  // Gatilho do foco no primeiro campo inválido (`FormErrorSummary`).
  const [submitCount, setSubmitCount] = useState(0);
  const [unchanged, setUnchanged] = useState(false);

  useEffect(() => {
    if (state.status === 'no-store') navigate(paths.seller, { replace: true });
  }, [state.status, navigate]);

  if (state.status === 'loading' || state.status === 'no-store') {
    return (
      <p role="status" className="px-4 py-12 text-center font-ui text-body text-texto-auxiliar">
        Carregando sua loja…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <Container as="main" width="narrow" className="py-8">
        <ErrorState message="Não foi possível carregar sua loja." onRetry={retry} />
      </Container>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitCount((count) => count + 1);
    setUnchanged(false);
    const result = await submit();

    if (result === 'saved') {
      toast('Loja atualizada.', { kind: 'success' });
      navigate(paths.seller);
    } else if (result === 'unchanged') {
      setUnchanged(true);
    }
  }

  const addressValue: StoreAddress = {
    cep: values.cep,
    street: values.street,
    number: values.number,
    complement: values.complement,
    district: values.district,
    city: values.city,
    state: values.state ?? '',
  };

  function handleAddressChange(field: keyof StoreAddress, value: string) {
    if (field === 'state') setField('state', value === '' ? null : value);
    else setField(field, value);
  }

  return (
    <Container as="main" width="narrow" className="py-8 tablet:py-12">
      <h1 className="font-display text-h2 text-tinta">Editar loja</h1>
      <p className="mt-2 font-ui text-body text-texto-auxiliar">
        Só o que você mudar é salvo. O resto da loja continua como está.
      </p>

      <form className="mt-8 flex flex-col gap-10" onSubmit={handleSubmit} noValidate>
        <fieldset className="flex flex-col gap-5" disabled={submitting}>
          <legend className={legendClass}>Sua loja</legend>
          <InputField
            id="store-name"
            label="Nome da loja"
            value={values.name}
            onChange={(value) => setField('name', value)}
            error={errors.name}
            disabled={submitting}
          />
          <TextArea
            id="store-description"
            label="Descrição (opcional)"
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
          <InputField
            id="store-document"
            label={documentLabel}
            value={documentNumber}
            onChange={() => {}}
            helperText="O documento não pode ser alterado por aqui."
            disabled
          />
        </fieldset>

        <fieldset className="flex flex-col gap-5" disabled={submitting}>
          <legend className={legendClass}>Endereço</legend>
          <AddressFields
            idPrefix="store"
            value={addressValue}
            onChange={handleAddressChange}
            errors={errors}
            cepStatus={cepStatus}
            disabled={submitting}
          />
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
            helperText="É para onde vai o valor das suas vendas. Confira com cuidado."
            disabled={submitting}
          />
        </fieldset>

        <div className="flex flex-col gap-4">
          {/* Na ordem da tela: o primeiro com erro recebe o foco. */}
          <FormErrorSummary
            submitCount={submitCount}
            items={[
              { id: 'store-name', message: errors.name },
              { id: 'store-cep', message: errors.cep },
              { id: 'store-street', message: errors.street },
              { id: 'store-number', message: errors.number },
              { id: 'store-district', message: errors.district },
              { id: 'store-city', message: errors.city },
              { id: 'store-state', message: errors.state },
              { id: 'store-pix', message: errors.pixKey },
            ]}
          />

          {unchanged ? (
            <p role="status" className="font-ui text-body-sm text-texto-auxiliar">
              Nada mudou na sua loja.
            </p>
          ) : null}

          {submitError ? (
            <p
              role="alert"
              className="border border-vermelho-escuro bg-vermelho-suave px-4 py-3 text-body-sm text-vermelho-escuro"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(paths.seller)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        </div>
      </form>
    </Container>
  );
}

export default EditStore;
