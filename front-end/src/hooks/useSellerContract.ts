import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/context/useToast';
import { paths } from '@/routes/paths';
import { getSellerContract } from '@/services/legalService';
import type { LegalDocument } from '@/types/legal';

export type SellerContractState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'pending'; document: LegalDocument }
  | { status: 'accepted'; document: LegalDocument; acceptedVersion: string };

/**
 * Passo do contrato de venda antes do "Quero vender" (FE-US003b-1, #215,
 * RN-93). Busca o contrato vigente em `legalService` e guarda, no estado do
 * fluxo, a versão aceita — que o `useCreateStore` manda no `createStore` como
 * `acceptedContractVersion`. É registro separado do aceite dos termos de uso.
 *
 * Não aceitar leva à Home com um aviso: sem contrato, nenhuma loja é criada.
 * O aceite não sobrevive a recarregar a página — ao voltar a `/sell`, o
 * contrato é mostrado de novo.
 *
 * Usage:
 *   const contract = useSellerContract();
 *   if (contract.state.status === 'pending')
 *     <DocumentModal open document={contract.state.document}
 *       onAccept={contract.accept} onDecline={contract.decline} requireScrollToEnd />
 */
export function useSellerContract() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [state, setState] = useState<SellerContractState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getSellerContract()
      .then((document) => {
        if (active) setState({ status: 'pending', document });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  const accept = useCallback((version: string) => {
    setState((current) =>
      current.status === 'pending'
        ? { status: 'accepted', document: current.document, acceptedVersion: version }
        : current,
    );
  }, []);

  const decline = useCallback(() => {
    toast('Sem aceitar o contrato de venda não dá para abrir uma loja.', { kind: 'info' });
    navigate(paths.home);
  }, [navigate, toast]);

  return {
    state,
    acceptedVersion: state.status === 'accepted' ? state.acceptedVersion : undefined,
    retry,
    accept,
    decline,
  };
}
