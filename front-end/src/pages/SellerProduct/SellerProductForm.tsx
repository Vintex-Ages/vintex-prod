import { useNavigate, useParams } from 'react-router-dom';
import AISuggestedTag from '@/components/common/AISuggestedTag';
import Button from '@/components/common/Button';
import InputField from '@/components/common/InputField';
import MediaUploader from '@/components/common/MediaUploader';
import PriceInput from '@/components/common/PriceInput';
import Select from '@/components/common/Select';
import TextArea from '@/components/common/TextArea';
import Container from '@/components/layout/Container';
import { CATEGORIES, COLORS, CONDITIONS, SIZES } from '@/components/catalog/categories';
import { useProductForm } from '@/hooks/useProductForm';
import { productDetail } from '@/routes/paths';
import type { ListingSuggestionField } from '@/types/vintex-ai';

/**
 * Cadastro de peça com apoio da IA (FE-US014-1 e FE-US014-2, #216 e #217).
 *
 * A mesma página serve `/seller/products/new` e `/seller/products/:id`: em modo
 * edição, o `useProductForm` carrega a peça pelo `getById`.
 *
 * A ordem da tela não é estética, é a ordem do fluxo: as fotos vêm primeiro
 * porque é delas que sai a sugestão. Ao subir, elas ganham URL de verdade, a IA
 * lê e os campos aparecem preenchidos com a etiqueta de sugestão (RN-56).
 * Digitar em cima apaga a etiqueta. Nada da IA bloqueia o cadastro: se ela
 * falhar, o aviso aparece e os campos seguem editáveis (RN-57).
 *
 * Fora desta entrega: a etapa separada de revisão antes de publicar
 * (FE-US016-1, #218), cortada para a Sprint 3. Aqui publicar é um botão só, com
 * confirmação explícita no próprio rótulo.
 *
 * Usage:
 *   <Route path="/seller/products/new" element={<SellerProductForm />} />
 */
export default function SellerProductForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
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
  } = useProductForm(id);

  const editando = Boolean(id);

  /** Etiqueta de sugestão no rótulo do campo, quando o valor veio da IA. */
  function marca(campo: ListingSuggestionField) {
    return suggested.has(campo) ? <AISuggestedTag compact /> : undefined;
  }

  async function handleSubmit(evento: React.FormEvent) {
    evento.preventDefault();
    const publicado = await submit();
    if (publicado) navigate(productDetail(publicado));
  }

  if (loading) {
    return (
      <Container>
        <p className="py-10 text-body text-texto-auxiliar" role="status">
          Carregando a peça...
        </p>
      </Container>
    );
  }

  return (
    <Container>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 py-6 tablet:py-10" noValidate>
        {/* `div` e não `header`: um `header` fora de elemento de seção vira
            landmark `banner`, e a página já tem o do layout. Duas banners numa
            página é erro de navegação por landmark. */}
        <div>
          <h1 className="font-display text-h2 text-tinta">
            {editando ? 'Editar peça' : 'Nova peça'}
          </h1>
          <p className="mt-1 text-body text-texto-auxiliar">
            Comece pelas fotos: a Vintex lê a peça e preenche o que conseguir.
          </p>
        </div>

        <MediaUploader
          id="fotos"
          label="Fotos da peça"
          value={values.media}
          onChange={setMedia}
          max={8}
          accept="image/jpeg,image/png,image/webp,image/heic"
          helperText="Até 8 fotos. A primeira é a capa do anúncio."
          error={errors.media}
          disabled={saving}
        />

        {suggested.size > 0 ? (
          /* Em `compact` a etiqueta e so o icone, com o texto no `aria-label`.
             Sem esta linha, quem vê a tela encontra uma estrelinha sem
             explicação, e a RN-56 pede que a origem do valor fique clara. */
          <p className="flex flex-wrap items-center gap-2 border border-linha bg-papel p-3 text-label text-texto-auxiliar">
            <AISuggestedTag compact label="Marca de campo sugerido" />
            Campos com esta marca foram preenchidos pela Vintex a partir das fotos. Ajuste o que não
            estiver certo.
          </p>
        ) : null}

        {analyzing ? (
          <p role="status" className="text-body text-vermelho-escuro">
            A Vintex está lendo as fotos...
          </p>
        ) : null}

        {aiNotes.length > 0 ? (
          <ul className="flex flex-col gap-1 border border-linha bg-papel p-3">
            {aiNotes.map((nota) => (
              <li key={nota} className="text-label text-texto-auxiliar">
                {nota}
              </li>
            ))}
          </ul>
        ) : null}

        <InputField
          id="titulo"
          label="Título"
          value={values.name}
          onChange={(valor) => setField('name', valor)}
          placeholder="Jaqueta de couro preta"
          error={errors.name}
          disabled={saving}
        />

        <div className="grid gap-6 tablet:grid-cols-2">
          <Select
            id="categoria"
            label="Categoria"
            value={values.category}
            onChange={(valor) => setField('category', valor)}
            options={CATEGORIES.filter((c) => c.value).map((c) => ({
              label: c.label,
              value: c.value as string,
            }))}
            placeholder="Escolha"
            error={errors.category}
            disabled={saving}
            labelAdornment={marca('category')}
          />

          <Select
            id="tamanho"
            label="Tamanho"
            value={values.size}
            onChange={(valor) => setField('size', valor)}
            options={SIZES.map((s) => ({ label: s, value: s }))}
            placeholder="Escolha"
            error={errors.size}
            disabled={saving}
            labelAdornment={marca('size')}
          />

          <Select
            id="cor"
            label="Cor"
            value={values.color}
            onChange={(valor) => setField('color', valor)}
            options={COLORS.map((c) => ({ label: c, value: c }))}
            placeholder="Escolha"
            error={errors.color}
            disabled={saving}
            labelAdornment={marca('color')}
          />

          <Select
            id="conservacao"
            label="Conservação"
            value={values.condition}
            onChange={(valor) => setField('condition', valor)}
            options={CONDITIONS.map((c) => ({ label: c, value: c }))}
            placeholder="Escolha"
            error={errors.condition}
            disabled={saving}
            labelAdornment={marca('condition')}
          />

          <InputField
            id="marca"
            label="Marca (opcional)"
            value={values.brand}
            onChange={(valor) => setField('brand', valor)}
            placeholder="Sem marca identificada"
            error={errors.brand}
            disabled={saving}
            labelAdornment={marca('brand')}
          />

          <PriceInput
            id="preco"
            label="Preço"
            value={values.priceCents}
            onChange={(cents) => setField('priceCents', cents)}
            error={errors.priceCents}
            disabled={saving}
          />
        </div>

        <TextArea
          id="descricao"
          label="Descrição"
          value={values.description}
          onChange={(valor) => setField('description', valor)}
          rows={5}
          maxLength={1000}
          placeholder="Conte o caimento, o tecido, as marcas de uso."
          error={errors.description}
          disabled={saving}
          labelAdornment={marca('description')}
        />

        {/* RN-46: peça de brechó é única. Mostrado para o vendedor não procurar
            o campo, e sem campo editável porque não há o que editar. */}
        <p className="text-body text-texto-auxiliar">
          Quantidade: <strong className="text-tinta">1 (peça única)</strong>
        </p>

        {formError ? (
          <p
            role="alert"
            className="border border-vermelho-escuro bg-vermelho-suave p-3 text-body text-vermelho-escuro"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-end">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || analyzing}>
            {saving ? 'Publicando...' : 'Publicar peça'}
          </Button>
        </div>
      </form>
    </Container>
  );
}
