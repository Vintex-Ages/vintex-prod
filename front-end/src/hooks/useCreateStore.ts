import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MediaItem } from '@/components/common/MediaUploader';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import { useMyStore } from '@/hooks/useMyStore';
import { paths } from '@/routes/paths';
import { lookupAddress } from '@/services/cepService';
import { createStore, StoreError } from '@/services/storeService';
import type { StoreInput } from '@/types/store';
import {
  formatCep,
  formatDocument,
  isValidDocument,
  onlyDigits,
  type DocumentType,
} from '@/utils/document';

/**
 * Estado e regras do "Quero vender" (FE-US006-1, #212). A tela `Sell` só
 * desenha; tudo o que decide alguma coisa mora aqui:
 *
 * 1. **Quem pode ver o formulário (P-06).** Uma loja por vendedor: quem já tem
 *    loja cai em `access: 'has-store'` e a tela manda para o painel. A fonte é
 *    `getMyStore` (via `useMyStore`), não `user.is_seller` — na API real o
 *    login não traz o papel, então o flag pode estar atrasado.
 * 2. **Máscara e validação do documento (RN-30).** A regra é de
 *    `utils/document.ts`; o hook só escolhe CPF ou CNPJ e aplica.
 * 3. **CEP → endereço.** Com 8 dígitos, consulta o `cepService` e preenche
 *    bairro, cidade e UF. Se a consulta cair, os campos seguem editáveis e o
 *    endereço pode ser digitado à mão — falha do ViaCEP não impede abrir loja.
 * 4. **Ordem do envio (RN-29, RN-31).** `createStore` → `refreshUser()` (para
 *    `is_seller` chegar ao menu) → toast de boas-vindas → `/seller`. Se só o
 *    `refreshUser` falhar, a loja já existe: segue para o painel mesmo assim,
 *    a guarda de lá consulta a loja e não o flag.
 *
 * Usage:
 *   const form = useCreateStore();
 *   if (form.access === 'has-store') return <Navigate to={paths.seller} replace />;
 *   <InputField value={form.values.name} onChange={(v) => form.setField('name', v)}
 *     error={form.errors.name} />
 *   <form onSubmit={(e) => { e.preventDefault(); void form.submit(); }}>
 */

export interface CreateStoreValues {
  name: string;
  description: string;
  /** Saída do `MediaUploader` em modo `single`: zero ou um item. */
  logo: MediaItem[];
  documentType: DocumentType;
  /** Já mascarado, como aparece no campo. */
  documentNumber: string;
  /** Já mascarado (`00000-000`). */
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string | null;
  pixKey: string;
}

export type CreateStoreField = keyof CreateStoreValues;
export type CreateStoreErrors = Partial<Record<CreateStoreField, string>>;
export type CepStatus = 'idle' | 'loading' | 'resolved' | 'not_found' | 'error';
/** `checking`/`error` da consulta de loja; `has-store` redireciona; `ready` mostra o formulário. */
export type SellAccess = 'checking' | 'error' | 'has-store' | 'ready';

export const DESCRIPTION_MAX_LENGTH = 500;

const INITIAL_VALUES: CreateStoreValues = {
  name: '',
  description: '',
  logo: [],
  documentType: 'cpf',
  documentNumber: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: null,
  pixKey: '',
};

const CEP_NOT_FOUND_MESSAGE = 'CEP não encontrado.';
const GENERIC_SUBMIT_ERROR = 'Não foi possível criar sua loja agora. Tente novamente.';

const DOCUMENT_LABEL: Record<DocumentType, { name: string; digits: number }> = {
  cpf: { name: 'CPF', digits: 11 },
  cnpj: { name: 'CNPJ', digits: 14 },
};

function required(value: string | null, message: string): string | undefined {
  return value?.trim() ? undefined : message;
}

function validate(values: CreateStoreValues, cepStatus: CepStatus): CreateStoreErrors {
  const document = DOCUMENT_LABEL[values.documentType];
  const errors: CreateStoreErrors = {
    name: required(values.name, 'Informe o nome da loja.'),
    documentNumber: !values.documentNumber
      ? `Informe o ${document.name}.`
      : isValidDocument(values.documentType, values.documentNumber)
        ? undefined
        : `${document.name} inválido. Confira os ${document.digits} dígitos.`,
    cep:
      onlyDigits(values.cep).length !== 8
        ? 'Informe um CEP válido.'
        : cepStatus === 'not_found'
          ? CEP_NOT_FOUND_MESSAGE
          : cepStatus === 'loading'
            ? 'Aguarde a busca do CEP.'
            : undefined,
    street: required(values.street, 'Informe a rua.'),
    number: required(values.number, 'Informe o número.'),
    district: required(values.district, 'Informe o bairro.'),
    city: required(values.city, 'Informe a cidade.'),
    state: required(values.state, 'Selecione a UF.'),
    pixKey: required(values.pixKey, 'Informe a chave Pix.'),
  };

  // Só as chaves com mensagem: `{}` significa "pode enviar".
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined),
  ) as CreateStoreErrors;
}

/** Tira as mensagens de `fields`, mantendo a mesma referência quando nada muda. */
function withoutErrors(
  errors: CreateStoreErrors,
  ...fields: CreateStoreField[]
): CreateStoreErrors {
  if (!fields.some((field) => field in errors)) return errors;
  const next = { ...errors };
  fields.forEach((field) => delete next[field]);
  return next;
}

function toStoreInput(values: CreateStoreValues, acceptedContractVersion?: string): StoreInput {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    logo: values.logo[0]?.file ?? null,
    // Só os dígitos: a máscara é da tela, não do dado.
    document: { type: values.documentType, number: onlyDigits(values.documentNumber) },
    address: {
      cep: onlyDigits(values.cep),
      street: values.street.trim(),
      number: values.number.trim(),
      complement: values.complement.trim() || undefined,
      district: values.district.trim(),
      city: values.city.trim(),
      state: values.state ?? '',
    },
    pixKey: values.pixKey.trim(),
    // FE-US003b-1 (#215): versão do contrato de venda aceita antes do formulário
    // (`useSellerContract`). Registro separado do aceite dos termos (RN-93).
    acceptedContractVersion,
  };
}

function toSubmitMessage(error: unknown): string {
  // `INTERNAL_ERROR` é o que o service devolve quando o back não mandou
  // envelope — a mensagem dele é técnica ("Erro ao consultar loja.").
  if (error instanceof StoreError && error.code !== 'INTERNAL_ERROR') {
    return error.message;
  }
  return GENERIC_SUBMIT_ERROR;
}

export interface UseCreateStoreOptions {
  /** Versão do contrato de venda aceita no passo anterior (`useSellerContract`). */
  acceptedContractVersion?: string;
}

export function useCreateStore({ acceptedContractVersion }: UseCreateStoreOptions = {}) {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const { state: storeState, retry: retryAccess } = useMyStore();

  const [values, setValues] = useState<CreateStoreValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<CreateStoreErrors>({});
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const access: SellAccess =
    storeState.status === 'loading'
      ? 'checking'
      : storeState.status === 'error'
        ? 'error'
        : storeState.store
          ? 'has-store'
          : 'ready';

  const cepDigits = onlyDigits(values.cep);

  // Mesmo padrão do cadastro (FE-US002-1): consulta assim que o CEP completa e
  // descarta a resposta de um CEP que já foi trocado.
  useEffect(() => {
    if (cepDigits.length !== 8) {
      setCepStatus('idle');
      return;
    }

    let active = true;
    setCepStatus('loading');

    lookupAddress(cepDigits)
      .then((address) => {
        if (!active) return;
        if (!address) {
          setCepStatus('not_found');
          setErrors((current) => ({ ...current, cep: CEP_NOT_FOUND_MESSAGE }));
          return;
        }
        setCepStatus('resolved');
        setValues((current) => ({
          ...current,
          district: address.neighborhood,
          city: address.city,
          state: address.state,
        }));
        setErrors((current) => withoutErrors(current, 'cep', 'district', 'city', 'state'));
      })
      .catch(() => {
        // Serviço fora do ar ou CEP recusado: a tela avisa e deixa digitar.
        if (active) setCepStatus('error');
      });

    return () => {
      active = false;
    };
  }, [cepDigits]);

  const setField = useCallback(
    <K extends CreateStoreField>(field: K, value: CreateStoreValues[K]) => {
      setValues((current) => {
        const next = { ...current, [field]: value };
        if (field === 'documentNumber') {
          next.documentNumber = formatDocument(current.documentType, value as string);
        }
        if (field === 'cep') {
          next.cep = formatCep(value as string);
        }
        return next;
      });
      setErrors((current) => withoutErrors(current, field));
    },
    [],
  );

  /** Troca CPF ↔ CNPJ: reaplica a máscara nova aos dígitos já digitados. */
  const setDocumentType = useCallback((documentType: DocumentType) => {
    setValues((current) => ({
      ...current,
      documentType,
      documentNumber: formatDocument(documentType, current.documentNumber),
    }));
    setErrors((current) => withoutErrors(current, 'documentNumber'));
  }, []);

  const submit = useCallback(async () => {
    if (submitting) return;

    const nextErrors = validate(values, cepStatus);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    let storeName: string;
    try {
      const store = await createStore(toStoreInput(values, acceptedContractVersion));
      storeName = store.name;
    } catch (error) {
      setSubmitError(toSubmitMessage(error));
      setSubmitting(false);
      return;
    }

    try {
      await refreshUser();
    } catch {
      // A loja foi criada; o menu se acerta no próximo `refreshUser`.
    }

    toast(`Boas-vindas! Sua loja ${storeName} está aberta.`, { kind: 'success' });
    navigate(paths.seller, { replace: true });
  }, [submitting, values, cepStatus, acceptedContractVersion, refreshUser, toast, navigate]);

  return {
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
  };
}
