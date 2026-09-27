import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORIES, COLORS, CONDITIONS, SIZES } from '@/components/catalog/categories';
import type { MediaItem } from '@/components/common/MediaUploader';
import {
  getById,
  createDraft,
  update,
  publish,
  uploadMedia,
} from '@/services/sellerProductService';
import { suggestListing } from '@/services/vintexAiService';
import type { ListingCorrection, ProductInput } from '@/types/product';
import type { ListingSuggestionField } from '@/types/vintex-ai';

/**
 * Estado e regras do cadastro de peça (FE-US014-1/2, #216 e #217).
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
  formError: string | null;
  setField: <K extends keyof ProductFormValues>(campo: K, valor: ProductFormValues[K]) => void;
  setMedia: (items: MediaItem[]) => void;
  submit: () => Promise<string | null>;
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
  const [formError, setFormError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>(productId);

  // Último estado renderizado. `setMedia` roda depois de duas idas à rede e
  // precisa saber o que o vendedor já digitou nesse meio tempo; ler do
  // updater do `setValues` não serve, porque ele é adiado e o `setSuggested`
  // logo abaixo veria um conjunto vazio.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Modo edição (FE-US019-2): carrega pelo `getById`, e não pelo detalhe
  // público, que responde 404 para peça despublicada e não traz rascunho.
  useEffect(() => {
    if (!productId) return;

    let ativo = true;
    setLoading(true);
    getById(productId)
      .then((peca) => {
        if (!ativo) return;
        setValues({
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
        });
      })
      .catch(() => {
        if (ativo) setFormError('Não foi possível carregar esta peça.');
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

  /** Salva e publica. Devolve o id da peça, ou `null` se não passou. */
  const submit = useCallback(async (): Promise<string | null> => {
    const encontrados = validar(values);
    setErrors(encontrados);
    if (Object.keys(encontrados).length > 0) return null;

    setSaving(true);
    setFormError(null);
    try {
      const input: Partial<ProductInput> = {
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

      const peca = draftId
        ? await update(draftId, input, corrections)
        : await createDraft(input, corrections);
      setDraftId(peca.id);

      await publish(peca.id);
      return peca.id;
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Não foi possível publicar a peça.';
      setFormError(mensagem);
      return null;
    } finally {
      setSaving(false);
    }
  }, [values, corrections, draftId]);

  return {
    values,
    errors,
    suggested,
    aiNotes,
    analyzing,
    saving,
    loading,
    formError,
    setField,
    setMedia,
    submit,
  };
}
