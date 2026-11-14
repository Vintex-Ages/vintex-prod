import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useCart } from '@/context/useCart';
import { useAddressLookup } from '@/hooks/useAddressLookup';
import { createOrder, getDeliveryAddressDefault, OrderError } from '@/services/orderService';
import type { DeliveryAddress } from '@/types/order';
import type { Product } from '@/types/product';
import type { StoreAddress } from '@/types/store';
import { netValue } from '@/utils/commission';
import { formatCep, onlyDigits } from '@/utils/document';

export type CheckoutAddressErrors = Partial<Record<keyof StoreAddress, string>>;

/** O que aconteceu ao confirmar; a página decide para onde ir. */
export type CheckoutResult =
  | { status: 'created'; orderId: string }
  /** 409 `PIECE_UNAVAILABLE`: a página avisa e volta ao carrinho. */
  | { status: 'unavailable' }
  /** 409 `STORE_WITHOUT_PIX`, endereço inválido ou envio repetido: fica na tela. */
  | { status: 'blocked' }
  | { status: 'error' };

const EMPTY_ADDRESS: StoreAddress = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
};

const CEP_NOT_FOUND_MESSAGE = 'CEP não encontrado.';
const GENERIC_ERROR = 'Não foi possível confirmar o pedido. Tente de novo.';

function required(value: string | undefined, message: string): string | undefined {
  return value?.trim() ? undefined : message;
}

/** Mesmas regras do endereço da criação de loja (`useCreateStore`). */
function validateAddress(address: StoreAddress, cepStatus: string): CheckoutAddressErrors {
  const errors: CheckoutAddressErrors = {
    cep:
      onlyDigits(address.cep).length !== 8
        ? 'Informe um CEP válido.'
        : cepStatus === 'not_found'
          ? CEP_NOT_FOUND_MESSAGE
          : cepStatus === 'loading'
            ? 'Aguarde a busca do CEP.'
            : undefined,
    street: required(address.street, 'Informe a rua.'),
    number: required(address.number, 'Informe o número.'),
    district: required(address.district, 'Informe o bairro.'),
    city: required(address.city, 'Informe a cidade.'),
    state: required(address.state, 'Selecione a UF.'),
  };
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message !== undefined),
  ) as CheckoutAddressErrors;
}

/** Endereço da tela (`AddressFields`) no contrato do Pedido (back-end#247). */
function toDeliveryAddress(address: StoreAddress): DeliveryAddress {
  return {
    zipCode: onlyDigits(address.cep),
    street: address.street.trim(),
    number: address.number.trim(),
    complement: address.complement?.trim() || undefined,
    neighborhood: address.district.trim(),
    city: address.city.trim(),
    state: address.state,
  };
}

function fromDeliveryAddress(address: DeliveryAddress): StoreAddress {
  return {
    cep: formatCep(address.zipCode),
    street: address.street,
    number: address.number,
    complement: address.complement ?? '',
    district: address.neighborhood,
    city: address.city,
    state: address.state,
  };
}

/**
 * Regras da etapa 1 do checkout (FE-US022-1, #319): endereço de entrega,
 * detalhamento e confirmação do Pedido de **uma** loja. A página só desenha.
 *
 * - Endereço pré-preenchido com o último usado (`getDeliveryAddressDefault`),
 *   se a pessoa ainda não digitou nada; CEP consultado por `useAddressLookup`.
 * - Detalhamento (VS-022): peças, comissão de 9% só como informação ("paga pelo
 *   vendedor", RN-11/RN-16) e total a pagar igual às peças.
 * - `confirm()` valida, chama `createOrder` uma vez só (trava síncrona contra
 *   duplo clique, lição da #283) e, no sucesso, relê o carrinho do back
 *   (`refresh`): o front não tira peça do carrinho por conta própria.
 * - `STORE_WITHOUT_PIX` vira `storeWithoutPix`, que bloqueia a confirmação.
 *
 * Usage:
 *   const checkout = useCheckout(products);
 *   const result = await checkout.confirm();
 *   if (result.status === 'created') navigate(orderPaymentPath(result.orderId));
 */
export function useCheckout(products: Product[]) {
  const { user } = useAuth();
  const userId = user?.id;
  const { refresh } = useCart();
  const [address, setAddress] = useState<StoreAddress>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<CheckoutAddressErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [storeWithoutPix, setStoreWithoutPix] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const busy = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getDeliveryAddressDefault(userId)
      .then((saved) => {
        if (active && saved && !touched.current) setAddress(fromDeliveryAddress(saved));
      })
      .catch(() => {
        // Sem endereço salvo: a pessoa preenche.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const setLookupField = useCallback((field: keyof StoreAddress, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
  }, []);

  const { cepStatus } = useAddressLookup(address.cep, setLookupField);

  const setAddressField = useCallback((field: keyof StoreAddress, value: string) => {
    touched.current = true;
    setAddress((current) => ({ ...current, [field]: field === 'cep' ? formatCep(value) : value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const productsReais = products.reduce((total, product) => total + product.price, 0);
  const totals = {
    productsReais,
    commissionReais: Math.round((productsReais - netValue(productsReais)) * 100) / 100,
    /** Total a pagar = peças: a comissão sai do vendedor, não do comprador. */
    totalReais: productsReais,
  };

  async function confirm(): Promise<CheckoutResult> {
    if (busy.current || storeWithoutPix || !userId) return { status: 'blocked' };

    const nextErrors = validateAddress(address, cepStatus);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return { status: 'blocked' };

    busy.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createOrder(userId, {
        productIds: products.map((product) => product.id),
        deliveryAddress: toDeliveryAddress(address),
      });
      // O que fica no carrinho, e em que estado, é o que o back devolver.
      await refresh();
      return { status: 'created', orderId: order.id };
    } catch (error) {
      if (error instanceof OrderError && error.code === 'PIECE_UNAVAILABLE') {
        return { status: 'unavailable' };
      }
      if (error instanceof OrderError && error.code === 'STORE_WITHOUT_PIX') {
        setStoreWithoutPix(true);
        return { status: 'blocked' };
      }
      setSubmitError(GENERIC_ERROR);
      return { status: 'error' };
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return {
    address,
    errors,
    cepStatus,
    submitting,
    storeWithoutPix,
    submitError,
    totals,
    setAddressField,
    confirm,
  };
}
