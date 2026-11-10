import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AISuggestedTag from '@/components/common/AISuggestedTag';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import Stepper from '@/components/common/Stepper';
import Container from '@/components/layout/Container';
import PriceBreakdown from '@/components/seller/PriceBreakdown';
import { CATEGORIES } from '@/components/catalog/categories';
import { useToast } from '@/context/useToast';
import {
  ETAPAS_CADASTRO,
  ETAPA_REVISAO,
  SECAO_POR_ETAPA,
  useProductFlow,
  type SecaoCadastro,
} from '@/hooks/useProductForm';
import { paths, sellerProductPath } from '@/routes/paths';
import { formatCentsToBRL } from '@/utils/format';
import { PRICE_OUT_OF_RANGE_MESSAGE } from '@/utils/priceSuggestion';
import type { ListingSuggestionField } from '@/types/vintex-ai';

/**
 * Revisão do anúncio antes de publicar (FE-US016-1, #218).
 *
 * A peça só vai ao ar daqui (RN-50): o formulário grava o rascunho e traz o
 * vendedor para esta tela, que mostra tudo como vai ser anunciado. Cada bloco
 * tem "Editar", que volta ao formulário com o foco na seção certa; ao
 * continuar de novo, o mesmo rascunho é regravado e o resumo já vem com a
 * mudança. Os campos que vieram da IA e o vendedor não mexeu mantêm a
 * `AISuggestedTag` (RN-56), inclusive a composição lida da etiqueta (#331),
 * logo depois de Marca. A foto da etiqueta não aparece aqui: ela não faz parte
 * da galeria do anúncio.
 *
 * Visual alinhado ao frame ajustado do Figma (T14, FE-FIG-2, #436): selo
 * "Etapa 2 de 2 • Revisão obrigatória", fotos em quadros, campos em caixas, bloco
 * de preço com a comissão e "Você recebe líquido no Pix", e "Confirmar e publicar
 * peça". Em telefone, uma coluna; na web (frame `171:6170`), fotos e dados à
 * esquerda e preço e publicação à direita. A tela continua só de leitura: o
 * frame mostra campos editáveis, o "Sugerir preço com IA" e a caixa "Revisei…",
 * que ficam como pendência (não existem na revisão, e a issue manda não criar
 * comportamento novo).
 *
 * "Confirmar e publicar" chama `publishDraft()` do hook: último `update` com as
 * correções sobre a IA e depois `publish`. Sem foto, publicar fica bloqueado com
 * o motivo na tela (RN-47); outros erros viram `Toast` e a revisão continua
 * aberta, com os dados.
 *
 * Se o vendedor pediu a sugestão de preço no formulário e o preço ficou fora
 * da faixa, o mesmo alerta aparece no bloco de preço (FE-US018-1, #326). Ele
 * não bloqueia publicar (RN-68).
 *
 * A regra mora no `useProductForm`, compartilhado com o formulário pelo
 * `SellerProductFlow`; esta página só decide o que mostrar e para onde ir.
 *
 * Usage:
 *   <Route element={<SellerProductFlow />}>
 *     <Route path={paths.sellerProductReview} element={<Review />} />
 *   </Route>
 */

const NAO_INFORMADO = 'Não informado';

/** Rótulo pequeno em caixa alta, no padrão do frame. */
const ROTULO = 'text-label font-bold uppercase';

/** Caixa de valor, no padrão dos campos do frame (só leitura). */
const CAIXA = 'border border-linha bg-branco-quente px-[0.95rem] py-3 text-body leading-tight';

/** Nota abaixo do campo, quando a IA o sugeriu e o vendedor ainda não revisou. */
const AJUDA_IA: Partial<Record<ListingSuggestionField, string>> = {
  color: 'Sugerido pela IA a partir da foto.',
  composition: 'Extraído somente porque a etiqueta está legível.',
};

function rotuloCategoria(valor: string | null): string {
  return CATEGORIES.find((categoria) => categoria.value === valor)?.label ?? valor ?? '';
}

type BotaoEditarProps = {
  /** Nome acessível do "Editar", para não serem vários botões iguais no leitor. */
  rotulo: string;
  onEditar: () => void;
};

function BotaoEditar({ rotulo, onEditar }: BotaoEditarProps) {
  return (
    <Button
      type="button"
      variant="quiet"
      onClick={onEditar}
      aria-label={rotulo}
      className="px-[0.75rem] text-label uppercase"
    >
      Editar
    </Button>
  );
}

type SecaoProps = {
  id: string;
  titulo: string;
  tituloClasse: string;
  rotuloEditar: string;
  onEditar: () => void;
  adorno?: ReactNode;
  children: ReactNode;
};

function Secao({ id, titulo, tituloClasse, rotuloEditar, onEditar, adorno, children }: SecaoProps) {
  const tituloId = `revisao-${id}`;

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id={tituloId} className={`${ROTULO} ${tituloClasse}`}>
            {titulo}
          </h2>
          {adorno}
        </div>
        <BotaoEditar rotulo={rotuloEditar} onEditar={onEditar} />
      </div>
      {children}
    </section>
  );
}

type LinhaResumo = {
  rotulo: string;
  valor: string;
  /** Campo que a IA pode ter sugerido; ausente nos que ela não preenche. */
  campo?: ListingSuggestionField;
  /** Ocupa as duas colunas na web. */
  inteira?: boolean;
};

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    values,
    suggested,
    saving,
    loading,
    loadFailed,
    formError,
    priceReais,
    publishBlocked,
    priceAlert,
    productStatus,
    publishDraft,
  } = useProductFlow();

  // Peça já anunciada ou pausada: a revisão só grava a edição (FE-US019-2).
  const editandoPublicada = productStatus !== undefined && productStatus !== 'rascunho';

  function editar(secao: SecaoCadastro) {
    if (id) navigate(sellerProductPath(id, secao));
  }

  function marca(campo?: ListingSuggestionField) {
    return campo && suggested.has(campo) ? <AISuggestedTag compact /> : null;
  }

  async function handlePublicar() {
    const resultado = await publishDraft();

    if (resultado.status === 'published') {
      toast('Peça publicada! Ela já aparece como anunciada no seu painel.', { kind: 'success' });
      navigate(paths.seller);
      return;
    }
    if (resultado.status === 'saved') {
      toast('Alterações salvas.', { kind: 'success' });
      navigate(paths.seller);
      return;
    }
    if (resultado.status === 'error') {
      toast(resultado.message, { kind: 'error' });
    }
    // `blocked`: o motivo já está na tela, vindo de `publishBlocked`.
  }

  const linhas: LinhaResumo[] = [
    { rotulo: 'Título da peça', valor: values.name, inteira: true },
    { rotulo: 'Categoria', valor: rotuloCategoria(values.category), campo: 'category' },
    { rotulo: 'Tamanho', valor: values.size ?? '', campo: 'size' },
    { rotulo: 'Cor principal', valor: values.color ?? '', campo: 'color' },
    // Lida da foto da etiqueta (#331).
    { rotulo: 'Composição da etiqueta', valor: values.composition, campo: 'composition' },
    { rotulo: 'Marca / Origem', valor: values.brand, campo: 'brand' },
    { rotulo: 'Estado de conservação', valor: values.condition ?? '', campo: 'condition' },
    // RN-46: peça de brechó é única.
    { rotulo: 'Quantidade', valor: '1 (peça única)' },
  ];

  const totalFotos = values.media.length;
  // A composição só vem da IA quando a foto da etiqueta foi lida.
  const etiquetaProcessada = suggested.has('composition');

  function conteudo() {
    if (loading) {
      return (
        <p className="py-10 text-body text-texto-auxiliar" role="status">
          Carregando a peça...
        </p>
      );
    }

    if (loadFailed) {
      return <ErrorState message={formError ?? 'Não foi possível carregar esta peça.'} />;
    }

    return (
      <div className="flex flex-col gap-6 web:grid web:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] web:items-start web:gap-12">
        <div className="flex flex-col gap-6">
          <Secao
            id="fotos"
            titulo="1. Fotos e etiqueta analisadas pela IA"
            tituloClasse="text-texto-auxiliar"
            rotuloEditar="Editar fotos"
            onEditar={() => editar('fotos')}
          >
            {totalFotos === 0 ? (
              <p className="text-body text-texto-auxiliar">Nenhuma foto adicionada.</p>
            ) : null}
            <ol className="grid grid-cols-3 gap-3">
              {values.media.map((item, indice) => (
                <li
                  key={item.id}
                  className="relative aspect-square overflow-hidden border border-linha bg-papel-profundo"
                >
                  <img
                    src={item.url}
                    alt={`Foto ${indice + 1} de ${totalFotos}${indice === 0 ? ' (capa)' : ''}`}
                    className="h-full w-full object-cover"
                  />
                  {indice === 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 left-1 bg-tinta/75 px-1 text-label font-bold text-branco-quente"
                    >
                      CAPA
                    </span>
                  ) : null}
                </li>
              ))}
              {etiquetaProcessada ? (
                <li className="flex aspect-square items-center justify-center border border-dashed border-linha bg-papel-profundo p-2 text-center text-label font-bold uppercase text-texto-auxiliar">
                  Etiqueta processada
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  onClick={() => editar('fotos')}
                  className="flex aspect-square w-full items-center justify-center border border-dashed border-linha bg-papel-profundo text-label text-texto-auxiliar transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
                >
                  + Foto
                </button>
              </li>
            </ol>
          </Secao>

          {etiquetaProcessada ? (
            <p className="border border-verde-rs/35 bg-papel px-[0.85rem] py-3 text-label text-verde-rs">
              <strong className="font-bold">Etiqueta processada:</strong> a IA encontrou marca,
              tamanho e composição. Confira os valores abaixo; se a leitura estiver errada, edite
              antes de publicar.
            </p>
          ) : null}

          {suggested.size > 0 ? (
            <p className="flex flex-wrap items-center gap-2 border border-linha bg-papel p-3 text-label text-texto-auxiliar">
              <AISuggestedTag compact label="Marca de campo sugerido" />
              Campos com esta marca foram preenchidos pela Vintex e você ainda não revisou. Confira
              antes de publicar.
            </p>
          ) : null}

          <Secao
            id="dados"
            titulo="Dados da peça"
            tituloClasse="text-texto-auxiliar"
            rotuloEditar="Editar dados da peça"
            onEditar={() => editar('dados')}
          >
            <dl className="flex flex-col gap-6 web:grid web:grid-cols-2 web:gap-x-3">
              {linhas.map(({ rotulo, valor, campo, inteira }) => (
                <div
                  key={rotulo}
                  className={`flex flex-col gap-1.5 ${inteira ? 'web:col-span-2' : ''}`}
                >
                  <dt className={`${ROTULO} flex items-center gap-2 text-tinta`}>
                    {rotulo}
                    {marca(campo)}
                  </dt>
                  <dd
                    className={`${CAIXA} flex min-h-12 items-center ${valor ? 'text-tinta' : 'text-texto-auxiliar'}`}
                  >
                    {valor || NAO_INFORMADO}
                  </dd>
                  {campo && AJUDA_IA[campo] && suggested.has(campo) ? (
                    <dd className="text-label text-texto-auxiliar">{AJUDA_IA[campo]}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </Secao>

          <Secao
            id="descricao"
            titulo="História e descrição da peça"
            tituloClasse="text-tinta"
            rotuloEditar="Editar descrição"
            onEditar={() => editar('descricao')}
            adorno={marca('description')}
          >
            <p
              className={`${CAIXA} min-h-12 whitespace-pre-line pb-8 ${
                values.description ? 'text-tinta' : 'text-texto-auxiliar'
              }`}
            >
              {values.description || NAO_INFORMADO}
            </p>
          </Secao>
        </div>

        <div className="flex flex-col gap-4 web:gap-6">
          <section
            aria-labelledby="revisao-preco"
            className="flex flex-col gap-3 border border-linha bg-papel-profundo p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="revisao-preco" className="text-body-sm font-bold uppercase text-tinta">
                Preço de venda (R$)
              </h2>
              <BotaoEditar rotulo="Editar preço" onEditar={() => editar('preco')} />
            </div>
            <p
              className={`${CAIXA} flex min-h-14 items-center font-ui text-h3 font-bold text-tinta`}
            >
              {values.priceCents === null ? NAO_INFORMADO : formatCentsToBRL(values.priceCents)}
            </p>
            <PriceBreakdown price={priceReais} variant="card" />
            {priceAlert ? (
              <p
                role="status"
                className="border-l-2 border-dourado bg-papel-profundo px-3 py-2 text-body-sm text-tinta"
              >
                {PRICE_OUT_OF_RANGE_MESSAGE[priceAlert]}
              </p>
            ) : null}
          </section>

          {publishBlocked ? (
            <p
              role="alert"
              className="border border-vermelho-escuro bg-vermelho-suave p-3 text-body text-vermelho-escuro"
            >
              {publishBlocked}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={handlePublicar}
            disabled={saving || publishBlocked !== null}
            className="min-h-14 w-full uppercase"
          >
            {editandoPublicada
              ? saving
                ? 'Salvando...'
                : 'Salvar alterações'
              : saving
                ? 'Publicando...'
                : 'Confirmar e publicar peça →'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Container as="main">
      <div className="flex flex-col gap-6 py-6 tablet:py-10">
        <Stepper
          steps={ETAPAS_CADASTRO}
          current={ETAPA_REVISAO}
          hideProgressLabel
          onStepSelect={(etapa) => editar(SECAO_POR_ETAPA[etapa])}
        />

        <div className="flex flex-col gap-1">
          <p className="inline-flex w-fit items-center gap-1 border border-verde-rs/30 bg-papel px-2 py-0.5 text-label font-bold uppercase text-verde-rs">
            <span aria-hidden="true" className="text-dourado">
              ★
            </span>
            Etapa 2 de 2 • Revisão obrigatória
          </p>
          <h1 className="font-display text-h3 text-tinta">Revise sua peça antes de publicar</h1>
          <p className="text-body-sm text-texto-auxiliar">
            Confira os campos sugeridos pela IA. Você pode corrigir tudo antes da confirmação final.
          </p>
        </div>

        {conteudo()}
      </div>
    </Container>
  );
}
