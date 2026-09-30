import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CATEGORIES, COLORS, CONDITIONS, SIZES } from '@/components/catalog/categories';
import type { MediaItem } from '@/components/common/MediaUploader';
import {
  getById,
  createDraft,
  update,
  publish,
  uploadMedia,
  SellerProductError,
} from '@/services/sellerProductService';
import { suggestListing } from '@/services/vintexAiService';
import type {
  ListingCorrection,
  ProductInput,
  ProductStatus,
  SellerProductDetail,
} from '@/types/product';
import type { ListingSuggestionField } from '@/types/vintex-ai';

/**
 * Estado e regras do cadastro de peça (FE-US014-1/2, #216 e #217) e da
 * revisão antes de publicar (FE-US016-1, #218).
 *
 * Três coisas moram aqui porque nenhuma é de apresentação:
 *
 * 1. **A ordem do fluxo.** A foto vem primeiro porque é ela que alimenta a IA:
 *    ao subir, as fotos ganham URL de verdade (`uploadMedia`) e essa URL vai
 *    para `suggestListing`, que é o que o servidor consegue baixar. Um `File`
 *    que nunca subiu não serve para a IA.
 * 2. **O que é sugestão e o que é do vendedor.** `suggested` marca os campos
 *    que a IA preencheu (RN-56); qualquer digitação no campo apaga a marca e
 *    registra a correção, que é o que o back guarda em `ai_corrections`.
 * 3. **Unidade do preço.** `PriceInput` trabalha em centavos, `ProductInput`
 *    em reais. A conversão é aqui, num lugar só.
 *
 * A IA nunca bloqueia o cadastro (RN-57): falha dela vira aviso, os campos
 * seguem editáveis e o vendedor preenche à mão.
 *
 * **Salvar e publicar são dois passos (#218).** Antes, um `submit()` só
 * gravava e publicava de uma vez. A revisão explícita (RN-50) pede que o
 * formulário apenas grave o rascunho e que só a revisão publique, então
 * `submit()` virou duas funções:
 *
 * - `saveDraft()`, do "Continuar para revisão": valida, faz `createDraft` na
 *   primeira vez e `update` depois, e NÃO publica. Vai sem `corrections`: o
 *   back acumula `ai_corrections` a cada gravação, e o vendedor pode ir e
 *   voltar entre formulário e revisão quantas vezes quiser.
 * - `publishDraft()`, do "Publicar" da revisão: `update(id, input,
 *   corrections)` com as correções juntadas até ali, uma vez só, e depois
 *   `publish(id)`, que não tem corpo (back-end#159).
 *
 * **Um hook para as duas telas, não um por tela.** `suggested` e
 * `corrections` só existem aqui no cliente: o back não guarda quais campos
 * vieram da IA. Com uma instância por página, a revisão abriria sem as marcas
 * e sem as correções. Por isso formulário e revisão ficam sob uma rota-pai
 * (`SellerProductFlow`) que chama este hook uma vez e entrega o resultado pelo
 * `<Outlet context>`; as páginas leem com `useProductFlow()`. O estado vive
 * enquanto o vendedor anda entre as duas e some ao sair do fluxo. Limite
 * conhecido: um F5 na revisão recarrega a peça pelo `getById`, mas as marcas
 * de sugerido e as correções ainda não enviadas se perdem.
 *
 * "Recarregar" o rascunho depois de salvar usa a resposta do próprio
 * `createDraft`/`update`, e não um `getById`: ele ainda não tem rota no back
 * (#202) e quebraria o fluxo fora do mock. `getById` só roda quando se entra
 * direto numa URL com um id que este hook ainda não tem em memória.
 */

export interface ProductFormValues {
  name: string;
  category: string | null;
  size: string | null;
  color: string | null;
  condition: string | null;
  brand: string;
  description: string;
  /** Centavos, como o `PriceInput` entrega. */
  priceCents: number | null;
  media: MediaItem[];
}

export type FieldErrors = Partial<Record<keyof ProductFormValues, string>>;

const VALORES_INICIAIS: ProductFormValues = {
  name: '',
  category: null,
  size: null,
  color: null,
  condition: null,
  brand: '',
  description: '',
  priceCents: null,
  media: [],
};

/** Campos do formulário que a IA sabe preencher, no nome que ela usa. */
const CAMPO_POR_SUGESTAO: Record<ListingSuggestionField, keyof ProductFormValues> = {
  category: 'category',
  color: 'color',
  size: 'size',
  condition: 'condition',
  description: 'description',
  brand: 'brand',
};

/**
 * Campos que são lista fechada na tela. A IA responde texto livre: o prompt do
 * back pede "tipo da peça" para `category` (ex.: "Camiseta"), e a tela usa a
 * taxonomia do catálogo (Roupas, Sapatos, Acessórios); e a cor de uma peça
 * branca com faixa preta volta como "Branco e preto", que não é nenhuma opção.
 * Sem casar contra a lista, o `Select` mostra o placeholder e o campo fica
 * vazio com a marca de sugerido ao lado — a tela diz que a IA preencheu uma
 * coisa que não está lá.
 */
const OPCOES_POR_CAMPO: Partial<Record<ListingSuggestionField, readonly string[]>> = {
  category: CATEGORIES.filter((c) => c.value).map((c) => c.value as string),
  size: SIZES,
  color: COLORS,
  condition: CONDITIONS,
};

const ROTULO_POR_CAMPO: Record<ListingSuggestionField, string> = {
  category: 'a categoria',
  color: 'a cor',
  size: 'o tamanho',
  condition: 'a conservação',
  description: 'a descrição',
  brand: 'a marca',
};

export const MENSAGEM_SEM_FOTO = 'Adicione ao menos uma foto antes de publicar.';
const MENSAGEM_INCOMPLETA =
  'Faltam dados obrigatórios. Use "Editar" para completar antes de publicar.';
const MENSAGEM_ERRO_PUBLICAR = 'Não foi possível publicar a peça. Tente de novo.';

/**
 * Etapas do cadastro no `Stepper`. Fotos e Dados dividem a mesma página, mas
 * são etapas separadas no indicador: é a ordem real do fluxo (a foto alimenta
 * a IA, que preenche os dados) e é o exemplo do próprio `Stepper` (#198). O
 * frame da revisão no Figma ainda está "a confirmar" na #218.
 */
export const ETAPAS_CADASTRO = [
  { id: 'fotos', label: 'Fotos' },
  { id: 'dados', label: 'Dados' },
  { id: 'revisao', label: 'Revisão' },
];
export const ETAPA_REVISAO = 2;

/** Blocos do formulário que a revisão sabe abrir (vão no hash da URL). */
export type SecaoCadastro = 'fotos' | 'dados' | 'descricao' | 'preco';

/** Seção do formulário de cada etapa concluída do `Stepper`. */
export const SECAO_POR_ETAPA: Record<number, SecaoCadastro> = { 0: 'fotos', 1: 'dados' };

export type PublishResult =
  | { status: 'published'; id: string }
  /** Edição de peça já anunciada ou pausada: grava sem mudar a situação dela. */
  | { status: 'saved'; id: string }
  /** RN-47 ou dado obrigatório faltando: a revisão mostra `publishBlocked`. */
  | { status: 'blocked' }
  | { status: 'error'; message: string };

function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/**
 * Valor da IA traduzido para a opção correspondente da tela, ou `null` quando
 * não existe equivalente. Compara sem acento e sem caixa, porque "seminovo" e
 * "Seminovo" são a mesma coisa; não tenta adivinhar parecidos, porque "Branco
 * e preto" casaria com dois e o palpite errado é pior que o campo vazio.
 */
function resolverOpcao(campo: ListingSuggestionField, valor: string): string | null {
  const opcoes = OPCOES_POR_CAMPO[campo];
  if (!opcoes) return valor;

  return opcoes.find((opcao) => semAcento(opcao) === semAcento(valor)) ?? null;
}

function paraReais(cents: number | null): number | undefined {
  return cents === null ? undefined : cents / 100;
}

function paraCentavos(reais: number | undefined): number | null {
  return reais === undefined ? null : Math.round(reais * 100);
}

/** Peça do service no formato da tela (preço em centavos, fotos como `MediaItem`). */
function paraValores(peca: SellerProductDetail): ProductFormValues {
  return {
    name: peca.name,
    category: peca.category ?? null,
    size: peca.size ?? null,
    color: peca.color ?? null,
    condition: peca.condition ?? null,
    brand: peca.brand ?? '',
    description: peca.description ?? '',
    priceCents: paraCentavos(peca.price),
    media: (peca.images ?? []).map((url, indice) => ({
      id: `${indice}`,
      url,
      type: 'image' as const,
      position: indice,
    })),
  };
}

function paraInput(values: ProductFormValues): Partial<ProductInput> {
  return {
    name: values.name.trim(),
    category: values.category ?? undefined,
    size: values.size ?? undefined,
    color: values.color ?? undefined,
    condition: values.condition ?? undefined,
    brand: values.brand.trim() || undefined,
    description: values.description.trim() || undefined,
    price: paraReais(values.priceCents),
    images: values.media.map((item) => item.url),
    quantity: 1,
  };
}

export function validar(values: ProductFormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.name.trim()) errors.name = 'Dê um título para a peça.';
  if (!values.category) errors.category = 'Escolha a categoria.';
  if (!values.size) errors.size = 'Escolha o tamanho.';
  if (!values.color) errors.color = 'Escolha a cor.';
  if (!values.condition) errors.condition = 'Escolha a conservação.';
  if (values.priceCents === null || values.priceCents <= 0) {
    errors.priceCents = 'Informe o preço.';
  }
  // RN-47: sem foto a peça não vai para o ar.
  if (values.media.length === 0) errors.media = 'Adicione ao menos uma foto.';

  return errors;
}

export interface UseProductFormResult {
  values: ProductFormValues;
  errors: FieldErrors;
  /** Campos que vieram da IA e o vendedor ainda não mexeu (RN-56). */
  suggested: Set<ListingSuggestionField>;
  /** Avisos da IA, ex.: marca não identificada (RN-58). */
  aiNotes: string[];
  analyzing: boolean;
  saving: boolean;
  loading: boolean;
  /** A peça da URL não carregou: a revisão não tem o que mostrar. */
  loadFailed: boolean;
  formError: string | null;
  /** Preço em reais para quem exibe (`PriceBreakdown`), ou `null` sem preço. */
  priceReais: number | null;
  /** Etapa do formulário no `Stepper`: Fotos enquanto não há foto, depois Dados. */
  formStep: number;
  /** RN-47 no formulário: só segue para a revisão com ao menos uma foto. */
  canContinue: boolean;
  /** Por que a revisão não pode publicar agora, ou `null` se pode. */
  publishBlocked: string | null;
  /**
   * Situação da peça no back, ou `undefined` antes do primeiro save. Fora de
   * `rascunho`, a revisão só salva as alterações (FE-US019-2).
   */
  productStatus: ProductStatus | undefined;
  setField: <K extends keyof ProductFormValues>(campo: K, valor: ProductFormValues[K]) => void;
  setMedia: (items: MediaItem[]) => void;
  /** Grava o rascunho sem publicar. Devolve o id, ou `null` se não passou. */
  saveDraft: () => Promise<string | null>;
  /**
   * Último `update` com as correções e, se a peça é rascunho, `publish`. Peça
   * anunciada ou pausada só é atualizada (`saved`). Só a revisão chama.
   */
  publishDraft: () => Promise<PublishResult>;
}

export function useProductForm(productId?: string): UseProductFormResult {
  const [values, setValues] = useState<ProductFormValues>(VALORES_INICIAIS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [suggested, setSuggested] = useState<Set<ListingSuggestionField>>(new Set());
  const [corrections, setCorrections] = useState<ListingCorrection[]>([]);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(productId));
  const [loadFailed, setLoadFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // O back recusou publicar por falta de foto (NO_IMAGE), mesmo com a tela
  // achando que tinha. Só sai quando as fotos mudam.
  const [semFotoNoBack, setSemFotoNoBack] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(productId);
  const [productStatus, setProductStatus] = useState<ProductStatus | undefined>(undefined);

  // Id da peça que já está em memória, do `getById` ou da resposta do último
  // save. Quando um rascunho novo é salvo, a URL passa a ter o id dele; é isto
  // que evita um `getById` desnecessário (e sem rota no back) nessa hora.
  const carregadoRef = useRef<string | undefined>(undefined);

  // Último estado renderizado. `setMedia` roda depois de duas idas à rede e
  // precisa saber o que o vendedor já digitou nesse meio tempo; ler do
  // updater do `setValues` não serve, porque ele é adiado e o `setSuggested`
  // logo abaixo veria um conjunto vazio.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Modo edição (FE-US019-2) e entrada direta na revisão: carrega pelo
  // `getById`, e não pelo detalhe público, que responde 404 para peça
  // despublicada e não traz rascunho.
  useEffect(() => {
    // O mesmo hook atravessa as rotas do fluxo: voltar a `/new` com um
    // rascunho em memória é começar outra peça do zero.
    if (!productId) {
      if (carregadoRef.current === undefined) return;
      carregadoRef.current = undefined;
      setValues(VALORES_INICIAIS);
      setErrors({});
      setSuggested(new Set());
      setCorrections([]);
      setAiNotes([]);
      setFormError(null);
      setSemFotoNoBack(false);
      setDraftId(undefined);
      setProductStatus(undefined);
      return;
    }
    if (productId === carregadoRef.current) return;

    let ativo = true;
    setLoading(true);
    setLoadFailed(false);
    getById(productId)
      .then((peca) => {
        if (!ativo) return;
        carregadoRef.current = peca.id;
        setDraftId(peca.id);
        setProductStatus(peca.status);
        setValues(paraValores(peca));
        // Outra peça: marcas e correções da anterior não valem para ela.
        setSuggested(new Set());
        setCorrections([]);
        setAiNotes([]);
        setSemFotoNoBack(false);
      })
      .catch(() => {
        if (!ativo) return;
        setFormError('Não foi possível carregar esta peça.');
        setLoadFailed(true);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });

    return () => {
      ativo = false;
    };
  }, [productId]);

  const setField = useCallback(
    <K extends keyof ProductFormValues>(campo: K, valor: ProductFormValues[K]) => {
      setValues((atual) => ({ ...atual, [campo]: valor }));
      setErrors((atual) => ({ ...atual, [campo]: undefined }));

      // Digitar em campo sugerido apaga a marca e registra a correção: é o que
      // o back guarda em `ai_corrections`, e é o dado que diz se a IA acertou.
      const sugestao = (Object.keys(CAMPO_POR_SUGESTAO) as ListingSuggestionField[]).find(
        (chave) => CAMPO_POR_SUGESTAO[chave] === campo,
      );
      if (!sugestao) return;

      const sugeridoAntes = String(values[campo] ?? '');
      const agora = String(valor ?? '');
      // Reescolher o mesmo valor não é correção: `ai_corrections` é o dado
      // que diz se a IA acertou, e registrar "corrigiu Preto para Preto" suja
      // exatamente a medida que ele existe para dar. A marca também fica.
      if (sugeridoAntes === agora) return;

      setSuggested((atual) => {
        if (!atual.has(sugestao)) return atual;

        const proximo = new Set(atual);
        proximo.delete(sugestao);
        setCorrections((lista) => [
          ...lista.filter((c) => c.field !== sugestao),
          { field: sugestao, suggested: sugeridoAntes || null, final: agora },
        ]);
        return proximo;
      });
    },
    [values],
  );

  /**
   * Fotos novas sobem de verdade antes de qualquer coisa: é a URL do servidor
   * que a IA consegue baixar. Sem isso, `suggestListing` receberia um endereço
   * que só existe dentro desta aba.
   */
  const setMedia = useCallback(async (items: MediaItem[]) => {
    setValues((atual) => ({ ...atual, media: items }));
    setErrors((atual) => ({ ...atual, media: undefined }));
    setSemFotoNoBack(false);

    // Sem foto nenhuma, o que a IA disse deixa de fazer sentido: os avisos
    // falariam de fotos que não estão mais ali. Os campos ficam, porque o
    // vendedor pode ter ajustado e não deve perder o que escreveu.
    if (items.length === 0) {
      setAiNotes([]);
      setSuggested(new Set());
      return;
    }

    const novas = items.filter((item) => item.file);
    if (novas.length === 0) return;

    setAnalyzing(true);
    setFormError(null);
    try {
      const urls = await uploadMedia(novas.map((item) => item.file as File));

      setValues((atual) => ({
        ...atual,
        media: atual.media.map((item) => {
          const indice = novas.findIndex((nova) => nova.id === item.id);
          return indice === -1 ? item : { ...item, url: urls[indice], file: undefined };
        }),
      }));

      const resultado = await suggestListing({ imageUrls: urls });

      if (!resultado.ok) {
        setAiNotes([resultado.message]);
        return;
      }

      const { fields, suggested: vindos, notes } = resultado.suggestion;

      // Campo cuja sugestão não existe na lista da tela não é preenchido nem
      // marcado: em vez disso, o que a IA leu vira aviso, para o vendedor
      // escolher sabendo. Marca sobre campo vazio seria mentira na tela.
      const encaixaram = new Set<ListingSuggestionField>();
      const resolvidos = new Map<ListingSuggestionField, string>();
      const forasDaLista: string[] = [];

      for (const chave of vindos) {
        const bruto = fields[chave];
        if (!bruto) continue;

        const resolvido = resolverOpcao(chave, bruto);
        if (resolvido === null) {
          forasDaLista.push(
            `A Vintex leu ${ROTULO_POR_CAMPO[chave]} como "${bruto}", que não está na lista. Escolha a mais próxima.`,
          );
          continue;
        }

        resolvidos.set(chave, resolvido);
        encaixaram.add(chave);
      }

      setAiNotes([...(notes ?? []), ...forasDaLista]);

      // Só preenche campo ainda vazio: sugestão não sobrescreve o que o
      // vendedor já escreveu.
      const atuais = valuesRef.current;
      const preenchidos = new Set<ListingSuggestionField>();
      const aPreencher: Partial<ProductFormValues> = {};

      for (const [chave, valor] of resolvidos) {
        const campo = CAMPO_POR_SUGESTAO[chave];
        if (atuais[campo] !== null && atuais[campo] !== '') continue;

        (aPreencher[campo] as string) = valor;
        preenchidos.add(chave);
      }

      setValues((atual) => ({ ...atual, ...aPreencher }));
      setSuggested(preenchidos);
    } catch {
      // RN-57: falha ao subir ou analisar não trava o cadastro.
      setAiNotes(['Não foi possível analisar as fotos. Preencha os campos à mão.']);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const saveDraft = useCallback(async (): Promise<string | null> => {
    const encontrados = validar(values);
    setErrors(encontrados);
    if (Object.keys(encontrados).length > 0) return null;

    setSaving(true);
    setFormError(null);
    try {
      const input = paraInput(values);
      // Sem correções de propósito: elas vão uma vez só, no `publishDraft`.
      const peca = draftId ? await update(draftId, input, []) : await createDraft(input, []);

      carregadoRef.current = peca.id;
      setDraftId(peca.id);
      setProductStatus(peca.status);
      // A revisão mostra o que o back gravou, não o que a tela achava que mandou.
      setValues(paraValores(peca));
      setSemFotoNoBack(false);
      return peca.id;
    } catch (error) {
      const mensagem =
        error instanceof Error ? error.message : 'Não foi possível salvar o rascunho.';
      setFormError(mensagem);
      return null;
    } finally {
      setSaving(false);
    }
  }, [values, draftId]);

  const faltaFoto = values.media.length === 0 || semFotoNoBack;
  const faltaDado = Object.keys(validar(values)).some((campo) => campo !== 'media');
  const publishBlocked = faltaFoto ? MENSAGEM_SEM_FOTO : faltaDado ? MENSAGEM_INCOMPLETA : null;

  const publishDraft = useCallback(async (): Promise<PublishResult> => {
    if (!draftId || publishBlocked) return { status: 'blocked' };

    setSaving(true);
    try {
      await update(draftId, paraInput(values), corrections);
      // Já foram: o back acumula, e mandar de novo duplicaria a medida.
      setCorrections([]);
      // Editar não muda a situação da peça: `publish` é só para rascunho. Numa
      // anunciada o back recusaria; numa pausada, republicaria sem o vendedor
      // pedir — republicar é ação própria do painel.
      if (productStatus !== undefined && productStatus !== 'rascunho') {
        return { status: 'saved', id: draftId };
      }
      await publish(draftId);
      return { status: 'published', id: draftId };
    } catch (error) {
      if (error instanceof SellerProductError && error.code === 'NO_IMAGE') {
        setSemFotoNoBack(true);
        return { status: 'blocked' };
      }
      // `INTERNAL_ERROR` é o que o service usa quando o back não mandou
      // envelope, e a mensagem dele é técnica.
      const mensagem =
        error instanceof SellerProductError && error.code !== 'INTERNAL_ERROR'
          ? error.message
          : MENSAGEM_ERRO_PUBLICAR;
      return { status: 'error', message: mensagem };
    } finally {
      setSaving(false);
    }
  }, [draftId, publishBlocked, values, corrections, productStatus]);

  return {
    values,
    errors,
    suggested,
    aiNotes,
    analyzing,
    saving,
    loading,
    loadFailed,
    formError,
    priceReais: paraReais(values.priceCents) ?? null,
    formStep: values.media.length === 0 ? 0 : 1,
    canContinue: values.media.length > 0 && !saving && !analyzing,
    publishBlocked,
    productStatus,
    setField,
    setMedia,
    saveDraft,
    publishDraft,
  };
}

/**
 * O `useProductForm` compartilhado pelas páginas do cadastro. Só funciona
 * dentro de `SellerProductFlow` (ver o comentário do topo).
 *
 * Usage:
 *   const { values, saveDraft } = useProductFlow();
 */
export function useProductFlow(): UseProductFormResult {
  return useOutletContext<UseProductFormResult>();
}
