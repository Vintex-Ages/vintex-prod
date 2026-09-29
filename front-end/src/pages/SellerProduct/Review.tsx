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
import type { ListingSuggestionField } from '@/types/vintex-ai';

/**
 * Revisão do anúncio antes de publicar (FE-US016-1, #218).
 *
 * A peça só vai ao ar daqui (RN-50): o formulário grava o rascunho e traz o
 * vendedor para esta tela, que mostra tudo como vai ser anunciado. Cada bloco
 * tem "Editar", que volta ao formulário com o foco na seção certa; ao
 * continuar de novo, o mesmo rascunho é regravado e o resumo já vem com a
 * mudança. Os campos que vieram da IA e o vendedor não mexeu mantêm a
 * `AISuggestedTag` (RN-56).
 *
 * "Publicar" chama `publishDraft()` do hook: último `update` com as correções
 * sobre a IA e depois `publish`. Sem foto, publicar fica bloqueado com o
 * motivo na tela (RN-47); outros erros viram `Toast` e a revisão continua
 * aberta, com os dados.
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

function rotuloCategoria(valor: string | null): string {
  return CATEGORIES.find((categoria) => categoria.value === valor)?.label ?? valor ?? '';
}

type BlocoResumoProps = {
  id: string;
  titulo: string;
  /** Nome acessível do "Editar", para não serem quatro botões iguais no leitor. */
  rotuloEditar: string;
  onEditar: () => void;
  adorno?: ReactNode;
  children: ReactNode;
};

function BlocoResumo({ id, titulo, rotuloEditar, onEditar, adorno, children }: BlocoResumoProps) {
  const tituloId = `revisao-${id}`;

  return (
    <section
      aria-labelledby={tituloId}
      className="flex flex-col gap-4 border border-linha bg-branco-quente p-4 tablet:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id={tituloId} className="font-display text-h4 text-tinta">
            {titulo}
          </h2>
          {adorno}
        </div>
        <Button type="button" variant="quiet" onClick={onEditar} aria-label={rotuloEditar}>
          Editar
        </Button>
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
    publishDraft,
  } = useProductFlow();

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
    if (resultado.status === 'error') {
      toast(resultado.message, { kind: 'error' });
    }
    // `blocked`: o motivo já está na tela, vindo de `publishBlocked`.
  }

  const linhas: LinhaResumo[] = [
    { rotulo: 'Título', valor: values.name },
    { rotulo: 'Categoria', valor: rotuloCategoria(values.category), campo: 'category' },
    { rotulo: 'Tamanho', valor: values.size ?? '', campo: 'size' },
    { rotulo: 'Cor', valor: values.color ?? '', campo: 'color' },
    { rotulo: 'Conservação', valor: values.condition ?? '', campo: 'condition' },
    { rotulo: 'Marca', valor: values.brand, campo: 'brand' },
    // RN-46: peça de brechó é única.
    { rotulo: 'Quantidade', valor: '1 (peça única)' },
  ];

  const totalFotos = values.media.length;

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
      <>
        {suggested.size > 0 ? (
          <p className="flex flex-wrap items-center gap-2 border border-linha bg-papel p-3 text-label text-texto-auxiliar">
            <AISuggestedTag compact label="Marca de campo sugerido" />
            Campos com esta marca foram preenchidos pela Vintex e você ainda não revisou. Confira
            antes de publicar.
          </p>
        ) : null}

        <BlocoResumo
          id="fotos"
          titulo="Fotos"
          rotuloEditar="Editar fotos"
          onEditar={() => editar('fotos')}
        >
          {totalFotos === 0 ? (
            <p className="text-body text-texto-auxiliar">Nenhuma foto adicionada.</p>
          ) : (
            <ol className="grid grid-cols-3 gap-2 tablet:grid-cols-4 web:grid-cols-6">
              {values.media.map((item, indice) => (
                <li
                  key={item.id}
                  className="aspect-square overflow-hidden border border-linha bg-papel-profundo"
                >
                  <img
                    src={item.url}
                    alt={`Foto ${indice + 1} de ${totalFotos}${indice === 0 ? ' (capa)' : ''}`}
                    className="h-full w-full object-cover"
                  />
                </li>
              ))}
            </ol>
          )}
        </BlocoResumo>

        <BlocoResumo
          id="dados"
          titulo="Dados da peça"
          rotuloEditar="Editar dados da peça"
          onEditar={() => editar('dados')}
        >
          <dl className="flex flex-col">
            {linhas.map(({ rotulo, valor, campo }) => (
              <div
                key={rotulo}
                className="flex flex-col gap-1 border-b border-linha py-2 last:border-b-0 tablet:flex-row tablet:items-center tablet:justify-between"
              >
                <dt className="flex items-center gap-2 text-body-sm text-texto-auxiliar">
                  {rotulo}
                  {marca(campo)}
                </dt>
                <dd className={valor ? 'text-body text-tinta' : 'text-body text-texto-auxiliar'}>
                  {valor || NAO_INFORMADO}
                </dd>
              </div>
            ))}
          </dl>
        </BlocoResumo>

        <BlocoResumo
          id="descricao"
          titulo="Descrição"
          rotuloEditar="Editar descrição"
          onEditar={() => editar('descricao')}
          adorno={marca('description')}
        >
          <p
            className={
              values.description
                ? 'whitespace-pre-line text-body text-tinta'
                : 'text-body text-texto-auxiliar'
            }
          >
            {values.description || NAO_INFORMADO}
          </p>
        </BlocoResumo>

        <BlocoResumo
          id="preco"
          titulo="Preço"
          rotuloEditar="Editar preço"
          onEditar={() => editar('preco')}
        >
          <div className="grid gap-4 tablet:grid-cols-2 tablet:items-center">
            <p className="font-display text-h2 text-tinta">
              {values.priceCents === null ? NAO_INFORMADO : formatCentsToBRL(values.priceCents)}
            </p>
            <PriceBreakdown price={priceReais} variant="card" />
          </div>
        </BlocoResumo>

        {publishBlocked ? (
          <p
            role="alert"
            className="border border-vermelho-escuro bg-vermelho-suave p-3 text-body text-vermelho-escuro"
          >
            {publishBlocked}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-end">
          <Button
            type="button"
            onClick={handlePublicar}
            disabled={saving || publishBlocked !== null}
          >
            {saving ? 'Publicando...' : 'Publicar'}
          </Button>
        </div>
      </>
    );
  }

  return (
    <Container as="main">
      <div className="flex flex-col gap-6 py-6 tablet:py-10">
        <Stepper
          steps={ETAPAS_CADASTRO}
          current={ETAPA_REVISAO}
          onStepSelect={(etapa) => editar(SECAO_POR_ETAPA[etapa])}
        />

        <div>
          <h1 className="font-display text-h2 text-tinta">Revisar anúncio</h1>
          <p className="mt-1 text-body text-texto-auxiliar">
            Confira como a peça vai aparecer. Ela só vai ao ar quando você publicar.
          </p>
        </div>

        {conteudo()}
      </div>
    </Container>
  );
}
