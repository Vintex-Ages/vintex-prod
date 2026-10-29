import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '@/components/common/MediaUploader';
import { useAddressLookup, type CepStatus } from '@/hooks/useAddressLookup';
import { getMyStoreDetails, updateMyStore } from '@/services/storeService';
import type { MyStoreDetails, StoreAddress, StoreUpdate } from '@/types/store';
import { formatCep, formatDocument, onlyDigits } from '@/utils/document';
import { CEP_NOT_FOUND_MESSAGE, validateStoreAddress } from '@/utils/storeAddress';

export interface EditStoreValues {
  name: string;
  description: string;
  /** Saída do `MediaUploader` em modo `single`: a logo atual, a nova ou nenhuma. */
  logo: MediaItem[];
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

export type EditStoreField = keyof EditStoreValues;
export type EditStoreErrors = Partial<Record<EditStoreField, string>>;

export type EditStoreState =
  | { status: 'loading' }
  | { status: 'error' }
  /** Sem loja: a tela não abre (a guarda de `/seller/*` já cuida, isto é o reforço). */
  | { status: 'no-store' }
  | { status: 'ready'; store: MyStoreDetails };

/** O que aconteceu ao salvar; a página decide o aviso e para onde ir. */
export type EditStoreResult = 'saved' | 'unchanged' | 'invalid' | 'error';

const GENERIC_SUBMIT_ERROR = 'Não foi possível salvar sua loja agora. Tente novamente.';

/** Id do item que representa a logo que a loja já tem. */
const CURRENT_LOGO_ID = 'logo-atual';

/** Valores de partida enquanto a loja não carrega. */
const EMPTY_STORE: MyStoreDetails = {
  id: '',
  name: '',
  description: '',
  logoUrl: null,
  pixKey: '',
  document: { type: 'cpf', number: '' },
  address: null,
};

function toValues(store: MyStoreDetails): EditStoreValues {
  return {
    name: store.name,
    description: store.description,
    logo: store.logoUrl
      ? [{ id: CURRENT_LOGO_ID, url: store.logoUrl, type: 'image', position: 0 }]
      : [],
    cep: formatCep(store.address?.cep ?? ''),
    street: store.address?.street ?? '',
    number: store.address?.number ?? '',
    complement: store.address?.complement ?? '',
    district: store.address?.district ?? '',
    city: store.address?.city ?? '',
    state: store.address?.state || null,
    pixKey: store.pixKey,
  };
}

function toAddress(values: EditStoreValues): StoreAddress {
  return {
    cep: onlyDigits(values.cep),
    street: values.street.trim(),
    number: values.number.trim(),
    complement: values.complement.trim() || undefined,
    district: values.district.trim(),
    city: values.city.trim(),
    state: values.state ?? '',
  };
}

function sameAddress(a: StoreAddress, b: StoreAddress | null): boolean {
  return (
    b !== null &&
    a.cep === onlyDigits(b.cep) &&
    a.street === b.street &&
    a.number === b.number &&
    (a.complement ?? '') === (b.complement ?? '') &&
    a.district === b.district &&
    a.city === b.city &&
    a.state === b.state
  );
}

/**
 * Só o que mudou em relação à loja carregada: é o envio parcial do
 * back-end#221. O endereço vai inteiro quando qualquer campo dele muda.
 */
function diff(store: MyStoreDetails, values: EditStoreValues): StoreUpdate {
  const update: StoreUpdate = {};
  if (values.name.trim() !== store.name) update.name = values.name.trim();
  if (values.description.trim() !== store.description) {
    update.description = values.description.trim();
  }

  const [logo] = values.logo;
  if (logo?.file) update.logo = logo.file;
  else if (!logo && store.logoUrl) update.logo = null;

  const address = toAddress(values);
  if (!sameAddress(address, store.address)) update.address = address;

  if (values.pixKey.trim() !== store.pixKey) update.pixKey = values.pixKey.trim();
  return update;
}

function validate(values: EditStoreValues, cepStatus: CepStatus): EditStoreErrors {
  const errors: EditStoreErrors = {
    ...(values.name.trim() ? {} : { name: 'Informe o nome da loja.' }),
    ...validateStoreAddress(values, cepStatus),
    ...(values.pixKey.trim() ? {} : { pixKey: 'Informe a chave Pix.' }),
  };
  return errors;
}

/**
 * Estado e regras de "Editar loja" (FE-US006-4, #335). A tela `EditStore` só
 * desenha:
 *
 * - carrega a própria loja com documento, endereço e chave Pix
 *   (`getMyStoreDetails`) e preenche o formulário;
 * - os campos e validações são os da criação da loja (`validateStoreAddress`,
 *   `AddressFields`). O documento aparece, mas não é editável: muda a
 *   identidade do vendedor e tem unicidade;
 * - o CEP só é consultado depois que a pessoa o altera: consultar o CEP
 *   carregado podia sobrescrever o endereço salvo;
 * - `submit()` manda só o que mudou (`updateMyStore`, PATCH parcial). Sem
 *   mudança, não chama a API (`'unchanged'`).
 *
 * Usage:
 *   const form = useEditStore();
 *   const result = await form.submit();
 *   if (result === 'saved') navigate(paths.seller);
 */
export function useEditStore() {
  const [state, setState] = useState<EditStoreState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<EditStoreValues>(() => toValues(EMPTY_STORE));
  const [errors, setErrors] = useState<EditStoreErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Contra duplo clique antes do próximo render (lição da #283).
  const submittingRef = useRef(false);
  const [cepTouched, setCepTouched] = useState(false);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getMyStoreDetails()
      .then((store) => {
        if (!active) return;
        if (!store) {
          setState({ status: 'no-store' });
          return;
        }
        setValues(toValues(store));
        setCepTouched(false);
        setState({ status: 'ready', store });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  const setLookupAddressField = useCallback((field: keyof StoreAddress, value: string) => {
    setValues((current) => ({
      ...current,
      [field]: field === 'state' && value === '' ? null : value,
    }));
  }, []);

  const { cepStatus } = useAddressLookup(cepTouched ? values.cep : '', setLookupAddressField);

  useEffect(() => {
    if (cepStatus === 'not_found') {
      setErrors((current) => ({ ...current, cep: CEP_NOT_FOUND_MESSAGE }));
    }
  }, [cepStatus]);

  const setField = useCallback(<K extends EditStoreField>(field: K, value: EditStoreValues[K]) => {
    if (field === 'cep') setCepTouched(true);
    setValues((current) => ({
      ...current,
      [field]: field === 'cep' ? formatCep(value as string) : value,
    }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const submit = useCallback(async (): Promise<EditStoreResult> => {
    if (state.status !== 'ready' || submittingRef.current) return 'invalid';

    const nextErrors = validate(values, cepStatus);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return 'invalid';

    const update = diff(state.store, values);
    if (Object.keys(update).length === 0) return 'unchanged';

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await updateMyStore(update);
      setState({ status: 'ready', store: saved });
      return 'saved';
    } catch {
      setSubmitError(GENERIC_SUBMIT_ERROR);
      return 'error';
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [state, values, cepStatus]);

  const documentLabel =
    state.status === 'ready' ? (state.store.document.type === 'cnpj' ? 'CNPJ' : 'CPF') : 'CPF';
  const documentNumber =
    state.status === 'ready'
      ? formatDocument(state.store.document.type, state.store.document.number)
      : '';

  return {
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
  };
}
