import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SellerProductFlow from './SellerProductFlow';
import SellerProductForm from './SellerProductForm';
import * as sellerProductService from '@/services/sellerProductService';
import * as vintexAiService from '@/services/vintexAiService';
import type { SellerProductDetail } from '@/types/product';

/**
 * Cadastro de peça com apoio da IA (#216, #217).
 *
 * O que estes testes seguram é a ordem do fluxo: a foto sobe antes de a IA ser
 * chamada, porque é a URL do servidor que ela consegue baixar — mandar o `File`
 * do navegador não funcionaria, e esse erro não aparece na tela, só no dia da
 * demonstração.
 */

const PECA: SellerProductDetail = {
  id: '7',
  name: 'Jaqueta de couro',
  price: 259.9,
  status: 'rascunho',
  category: 'Roupas',
  size: 'M',
  color: 'Preto',
  condition: 'Seminovo',
  brand: 'Zara',
  description: 'Jaqueta de couro sintético.',
  images: ['https://api.test/api/media/products/photos/abc'],
  quantity: 1,
  store: { id: '1', name: 'Brechó da Ana', city: 'Porto Alegre' },
  aiCorrections: [],
};

function renderForm(rota = '/seller/products/new') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route element={<SellerProductFlow />}>
          <Route path="/seller/products/new" element={<SellerProductForm />} />
          <Route path="/seller/products/:id" element={<SellerProductForm />} />
          <Route path="/seller/products/:id/review" element={<h1>Revisão da peça</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function foto(nome = 'frente.jpg') {
  return new File(['conteudo'], nome, { type: 'image/jpeg' });
}

async function subirFoto(nome = 'frente.jpg') {
  fireEvent.change(screen.getByLabelText('Fotos da peça'), {
    target: { files: [foto(nome)] },
  });
  await waitFor(() => expect(vi.mocked(sellerProductService.uploadMedia)).toHaveBeenCalled());
}

const ROTULO_COMPOSICAO = 'Composição da etiqueta (opcional)';
const NOTA_COMPOSICAO = 'Extraído somente porque a etiqueta está legível.';

function subirEtiqueta(nome: string) {
  fireEvent.change(screen.getByLabelText('Foto da etiqueta (opcional)'), {
    target: { files: [foto(nome)] },
  });
}

/**
 * A `AISuggestedTag` ao lado do rótulo de um campo, ou `null` se ele não está
 * marcado. O adorno é irmão do `<label>`, dentro da mesma linha.
 */
function marcaDoCampo(rotulo: string) {
  const linhaDoRotulo = screen.getByText(rotulo, { selector: 'label' }).parentElement;
  return linhaDoRotulo
    ? within(linhaDoRotulo).queryByRole('img', { name: 'Sugerido pela IA' })
    : null;
}

function preencherObrigatorios() {
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Jaqueta' } });
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Roupas' } });
  fireEvent.change(screen.getByLabelText('Tamanho'), { target: { value: 'M' } });
  fireEvent.change(screen.getByLabelText('Cor'), { target: { value: 'Preto' } });
  fireEvent.change(screen.getByLabelText('Conservação'), { target: { value: 'Seminovo' } });
  fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '259,90' } });
}

beforeEach(() => {
  vi.spyOn(sellerProductService, 'uploadMedia').mockResolvedValue([
    'https://api.test/api/media/products/photos/abc',
  ]);
  vi.spyOn(sellerProductService, 'createDraft').mockResolvedValue(PECA);
  vi.spyOn(sellerProductService, 'update').mockResolvedValue(PECA);
  vi.spyOn(sellerProductService, 'publish').mockResolvedValue({ ...PECA, status: 'ativo' });
  vi.spyOn(sellerProductService, 'getById').mockResolvedValue(PECA);
  vi.spyOn(vintexAiService, 'suggestListing').mockResolvedValue({
    ok: true,
    suggestion: {
      fields: {
        category: 'Roupas',
        color: 'Preto',
        size: 'M',
        condition: 'Seminovo',
        description: 'Jaqueta de couro sintético preta.',
      },
      suggested: ['category', 'color', 'size', 'condition', 'description'],
      notes: ['Marca não identificada: etiqueta ilegível ou ausente.'],
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SellerProductForm', () => {
  it('a foto sobe antes de a IA ser chamada, e a IA recebe a URL do servidor', async () => {
    renderForm();

    await subirFoto();

    await waitFor(() =>
      expect(vi.mocked(vintexAiService.suggestListing)).toHaveBeenCalledWith({
        imageUrls: ['https://api.test/api/media/products/photos/abc'],
      }),
    );
  });

  it('preenche os campos com o que a IA leu e marca cada um como sugerido', async () => {
    renderForm();

    await subirFoto();

    await waitFor(() => expect(screen.getByLabelText('Cor')).toHaveValue('Preto'));
    expect(screen.getByLabelText('Categoria')).toHaveValue('Roupas');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Jaqueta de couro sintético preta.');
    // Uma etiqueta por campo sugerido, cinco no total.
    expect(screen.getAllByRole('img', { name: 'Sugerido pela IA' })).toHaveLength(5);
  });

  /**
   * Caso real do primeiro teste com a API: a foto era de uma camiseta branca
   * com faixa preta, e o Gemini respondeu `category: "Camiseta"` (o prompt do
   * back pede tipo da peça, não a taxonomia do catálogo) e uma cor composta.
   * Nenhum dos dois existe na lista da tela, e o `Select` mostrava o
   * placeholder com a estrelinha de "preenchido pela IA" ao lado.
   */
  it('sugestão fora da lista não preenche nem marca, e diz o que a IA leu', async () => {
    vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
      ok: true,
      suggestion: {
        fields: {
          category: 'Camiseta',
          color: 'Branco e preto',
          description: 'Camiseta branca com faixa preta.',
        },
        suggested: ['category', 'color', 'description'],
      },
    });
    renderForm();

    await subirFoto();

    await waitFor(() =>
      expect(screen.getByLabelText('Descrição')).toHaveValue('Camiseta branca com faixa preta.'),
    );
    expect(screen.getByLabelText('Categoria')).toHaveValue('');
    expect(screen.getByLabelText('Cor')).toHaveValue('');
    // Uma marca só, a da descrição, mais a da legenda.
    expect(screen.getAllByRole('img', { name: 'Sugerido pela IA' })).toHaveLength(1);
    expect(screen.getByText(/leu a categoria como "Camiseta"/i)).toBeInTheDocument();
    expect(screen.getByText(/leu a cor como "Branco e preto"/i)).toBeInTheDocument();
  });

  it('sugestão com acento ou caixa diferente ainda encaixa na lista', async () => {
    vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
      ok: true,
      suggestion: {
        fields: { color: 'preto', condition: 'seminovo' },
        suggested: ['color', 'condition'],
      },
    });
    renderForm();

    await subirFoto();

    await waitFor(() => expect(screen.getByLabelText('Cor')).toHaveValue('Preto'));
    expect(screen.getByLabelText('Conservação')).toHaveValue('Seminovo');
  });

  // #331: antes a composição sugerida era ignorada, porque não havia campo.
  it('composição sugerida preenche o campo "Composição da etiqueta" com a marca de IA', async () => {
    vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
      ok: true,
      suggestion: {
        fields: { color: 'Preto', composition: '100% algodão' },
        suggested: ['color', 'composition'],
      },
    });
    renderForm();

    await subirFoto();

    await waitFor(() =>
      expect(screen.getByLabelText(ROTULO_COMPOSICAO)).toHaveValue('100% algodão'),
    );
    expect(marcaDoCampo(ROTULO_COMPOSICAO)).not.toBeNull();
    expect(screen.getByText(NOTA_COMPOSICAO)).toBeInTheDocument();
  });

  it('editar a composição apaga a etiqueta de sugestão dela', async () => {
    vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
      ok: true,
      suggestion: {
        fields: { color: 'Preto', composition: '100% algodão' },
        suggested: ['color', 'composition'],
      },
    });
    renderForm();
    await subirFoto();
    await waitFor(() => expect(marcaDoCampo(ROTULO_COMPOSICAO)).not.toBeNull());

    fireEvent.change(screen.getByLabelText(ROTULO_COMPOSICAO), {
      target: { value: '95% algodão, 5% elastano' },
    });

    await waitFor(() => expect(marcaDoCampo(ROTULO_COMPOSICAO)).toBeNull());
    expect(screen.getByLabelText(ROTULO_COMPOSICAO)).toHaveValue('95% algodão, 5% elastano');
    // A marca da cor não tem nada com isso.
    expect(marcaDoCampo('Cor')).not.toBeNull();
  });

  describe('foto da etiqueta (#331, VS-015)', () => {
    // Objetivo declarado 1 (VS-015 cenário 1), pelo mock real do service.
    it('etiqueta legível preenche marca e composição com a marca de IA e avisa', async () => {
      vi.mocked(vintexAiService.suggestListing).mockRestore();
      renderForm();

      await subirFoto();
      subirEtiqueta('etiqueta.jpg');

      await waitFor(
        () => expect(screen.getByLabelText(ROTULO_COMPOSICAO)).toHaveValue('100% algodão'),
        { timeout: 4000 },
      );
      expect(screen.getByLabelText('Marca (opcional)')).toHaveValue('Zara');
      expect(marcaDoCampo(ROTULO_COMPOSICAO)).not.toBeNull();
      expect(marcaDoCampo('Marca (opcional)')).not.toBeNull();
      expect(
        screen.getByText(
          /Etiqueta processada: a IA encontrou marca, tamanho e composição\. Confira os valores/,
        ),
      ).toBeInTheDocument();
    });

    // Objetivo declarado 2 (VS-015 cenário 2, RN-59): o motivo é o texto do service.
    it('etiqueta ilegível não preenche marca nem composição e mostra o motivo', async () => {
      vi.mocked(vintexAiService.suggestListing).mockRestore();
      renderForm();

      subirEtiqueta('etiqueta-ilegivel.jpg');
      await subirFoto();

      await waitFor(
        () => expect(screen.getByText(/a foto da etiqueta está ilegível/i)).toBeInTheDocument(),
        { timeout: 4000 },
      );
      expect(screen.getByLabelText(ROTULO_COMPOSICAO)).toHaveValue('');
      expect(screen.getByLabelText('Marca (opcional)')).toHaveValue('');
      expect(marcaDoCampo(ROTULO_COMPOSICAO)).toBeNull();
      expect(screen.queryByText(/Etiqueta processada/)).not.toBeInTheDocument();
      expect(screen.queryByText(NOTA_COMPOSICAO)).not.toBeInTheDocument();
    });

    it('etiqueta enviada antes das fotos vai junto na análise, como arquivo separado', async () => {
      renderForm();

      subirEtiqueta('etiqueta.jpg');
      // Sem foto da peça não há análise: o service exige ao menos uma.
      expect(vi.mocked(vintexAiService.suggestListing)).not.toHaveBeenCalled();
      await subirFoto();

      await waitFor(() =>
        expect(vi.mocked(vintexAiService.suggestListing)).toHaveBeenCalledWith({
          imageUrls: ['https://api.test/api/media/products/photos/abc'],
          labelImage: expect.objectContaining({ name: 'etiqueta.jpg' }),
        }),
      );
      // Quem sobe a etiqueta é o service (kind 'label'); a galeria só sobe a foto.
      const [arquivos] = vi.mocked(sellerProductService.uploadMedia).mock.calls[0];
      expect(arquivos.map((arquivo) => arquivo.name)).toEqual(['frente.jpg']);
    });

    it('etiqueta enviada depois das fotos refaz a análise com as fotos já enviadas', async () => {
      renderForm();
      await subirFoto();
      await waitFor(() =>
        expect(vi.mocked(vintexAiService.suggestListing)).toHaveBeenCalledTimes(1),
      );

      subirEtiqueta('etiqueta.jpg');

      await waitFor(() =>
        expect(vi.mocked(vintexAiService.suggestListing)).toHaveBeenLastCalledWith({
          imageUrls: ['https://api.test/api/media/products/photos/abc'],
          labelImage: expect.objectContaining({ name: 'etiqueta.jpg' }),
        }),
      );
      expect(vi.mocked(sellerProductService.uploadMedia)).toHaveBeenCalledTimes(1);
    });

    it('a foto da etiqueta não entra na galeria nem nas imagens salvas', async () => {
      renderForm();
      await subirFoto();
      subirEtiqueta('etiqueta.jpg');
      await waitFor(() =>
        expect(vi.mocked(vintexAiService.suggestListing)).toHaveBeenCalledTimes(2),
      );
      preencherObrigatorios();

      // Uma mídia em cada área, não duas na galeria.
      expect(
        within(document.getElementById('secao-fotos') as HTMLElement).getAllByRole('button', {
          name: /Remover mídia/,
        }),
      ).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));

      await waitFor(() => expect(vi.mocked(sellerProductService.createDraft)).toHaveBeenCalled());
      const [input] = vi.mocked(sellerProductService.createDraft).mock.calls[0];
      expect(input.images).toEqual(['https://api.test/api/media/products/photos/abc']);
    });

    it('só com a foto da etiqueta, sem foto da peça, continua sem poder seguir (RN-47)', () => {
      renderForm();
      preencherObrigatorios();

      subirEtiqueta('etiqueta.jpg');

      expect(screen.getByRole('button', { name: 'Continuar para revisão' })).toBeDisabled();
      expect(vi.mocked(sellerProductService.uploadMedia)).not.toHaveBeenCalled();
    });

    it('a composição vai junto no rascunho salvo', async () => {
      vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
        ok: true,
        suggestion: { fields: { composition: '100% algodão' }, suggested: ['composition'] },
      });
      renderForm();
      await subirFoto();
      await waitFor(() =>
        expect(screen.getByLabelText(ROTULO_COMPOSICAO)).toHaveValue('100% algodão'),
      );
      preencherObrigatorios();

      fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));

      await waitFor(() => expect(vi.mocked(sellerProductService.createDraft)).toHaveBeenCalled());
      const [input] = vi.mocked(sellerProductService.createDraft).mock.calls[0];
      expect(input.composition).toBe('100% algodão');
    });
  });

  it('marca não identificada aparece como aviso, sem preencher o campo (RN-58)', async () => {
    renderForm();

    await subirFoto();

    await waitFor(() => expect(screen.getByText(/etiqueta ilegível/i)).toBeInTheDocument());
    expect(screen.getByLabelText('Marca (opcional)')).toHaveValue('');
  });

  it('digitar em campo sugerido apaga a etiqueta daquele campo', async () => {
    renderForm();
    await subirFoto();
    await waitFor(() =>
      expect(screen.getAllByRole('img', { name: 'Sugerido pela IA' })).toHaveLength(5),
    );

    fireEvent.change(screen.getByLabelText('Cor'), { target: { value: 'Verde' } });

    await waitFor(() =>
      expect(screen.getAllByRole('img', { name: 'Sugerido pela IA' })).toHaveLength(4),
    );
  });

  it('falha da IA avisa e deixa os campos editáveis (RN-57)', async () => {
    vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
      ok: false,
      reason: 'unavailable',
      message: 'Não foi possível analisar as fotos agora.',
    });
    renderForm();

    await subirFoto();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível analisar as fotos agora.')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Título')).toBeEnabled();
  });

  it('falha ao subir a foto não trava o cadastro', async () => {
    vi.mocked(sellerProductService.uploadMedia).mockRejectedValue(new Error('rede fora'));
    renderForm();

    await subirFoto();

    await waitFor(() => expect(screen.getByText(/Preencha os campos à mão/i)).toBeInTheDocument());
    expect(screen.getByLabelText('Título')).toBeEnabled();
  });

  it('remover todas as fotos limpa os avisos da IA, mas mantém o que já foi preenchido', async () => {
    renderForm();
    await subirFoto();
    await waitFor(() => expect(screen.getByText(/etiqueta ilegível/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Remover mídia 1' }));

    await waitFor(() => expect(screen.queryByText(/etiqueta ilegível/i)).not.toBeInTheDocument());
    expect(screen.queryAllByRole('img', { name: 'Sugerido pela IA' })).toHaveLength(0);
    // O que a IA preencheu e o vendedor pode ter ajustado continua lá.
    expect(screen.getByLabelText('Descrição')).toHaveValue('Jaqueta de couro sintético preta.');
  });

  it('"Continuar para revisão" fica desabilitado sem foto (RN-47)', async () => {
    renderForm();
    preencherObrigatorios();

    expect(screen.getByRole('button', { name: 'Continuar para revisão' })).toBeDisabled();

    await subirFoto();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuar para revisão' })).toBeEnabled(),
    );
  });

  it('continuar sem os campos obrigatórios mostra o erro em cada campo', async () => {
    renderForm();
    await subirFoto();

    fireEvent.click(await screen.findByRole('button', { name: 'Continuar para revisão' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Título')).toHaveAccessibleDescription(
        'Dê um título para a peça.',
      ),
    );
    expect(screen.getByLabelText('Preço')).toHaveAccessibleDescription('Informe o preço.');
    // Um resumo só, não um alerta por campo, e o foco vai ao primeiro inválido (#283).
    expect(screen.getByRole('alert')).toHaveTextContent('Confira 2 campos');
    expect(screen.getByLabelText('Título')).toHaveFocus();
    expect(vi.mocked(sellerProductService.createDraft)).not.toHaveBeenCalled();
  });

  it('continuar salva o rascunho em reais, NÃO publica e vai para a revisão', async () => {
    renderForm();
    await subirFoto();
    preencherObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));

    expect(await screen.findByRole('heading', { name: 'Revisão da peça' })).toBeInTheDocument();
    const [input] = vi.mocked(sellerProductService.createDraft).mock.calls[0];
    // `PriceInput` entrega centavos; `ProductInput.price` é em reais.
    expect(input.price).toBe(259.9);
    expect(input.quantity).toBe(1);
    expect(input.images).toEqual(['https://api.test/api/media/products/photos/abc']);
    // RN-50: só a revisão publica.
    expect(vi.mocked(sellerProductService.publish)).not.toHaveBeenCalled();
    // A peça recém-criada já está em memória: nada de `getById` (sem rota no back).
    expect(vi.mocked(sellerProductService.getById)).not.toHaveBeenCalled();
  });

  it('as correções sobre a IA ficam guardadas para o update da revisão, não vão no rascunho', async () => {
    renderForm();
    await subirFoto();
    await waitFor(() => expect(screen.getByLabelText('Cor')).toHaveValue('Preto'));

    preencherObrigatorios();
    fireEvent.change(screen.getByLabelText('Cor'), { target: { value: 'Verde' } });

    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));

    await waitFor(() => expect(vi.mocked(sellerProductService.createDraft)).toHaveBeenCalled());
    const [, corrections] = vi.mocked(sellerProductService.createDraft).mock.calls[0];
    expect(corrections).toEqual([]);
  });

  it('erro do service ao salvar o rascunho aparece na tela, sem navegar', async () => {
    vi.mocked(sellerProductService.createDraft).mockRejectedValue(
      new Error('Nome e preço são obrigatórios.'),
    );
    renderForm();
    await subirFoto();
    preencherObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Nome e preço são obrigatórios.'),
    );
    expect(screen.queryByRole('heading', { name: 'Revisão da peça' })).not.toBeInTheDocument();
  });

  it('o Stepper mostra Fotos sem foto e Dados depois da primeira foto', async () => {
    const { container } = renderForm();

    expect(container.querySelector('[aria-current="step"]')).toHaveTextContent('Fotos');

    await subirFoto();

    await waitFor(() =>
      expect(container.querySelector('[aria-current="step"]')).toHaveTextContent('Dados'),
    );
  });

  it('"Voltar para Fotos" no Stepper leva o foco para a área de fotos', async () => {
    renderForm();
    await subirFoto();

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar para Fotos' }));

    expect(document.activeElement?.closest('#secao-fotos')).not.toBeNull();
  });

  it.each([
    ['preco', 'Preço'],
    ['descricao', 'Descrição'],
    ['dados', 'Título'],
  ])('vindo da revisão com #%s, foca o campo %s', async (secao, rotulo) => {
    renderForm(`/seller/products/7#${secao}`);

    await waitFor(() => expect(screen.getByLabelText(rotulo)).toHaveFocus());
  });

  it('mostra a quantidade fixa, sem campo editável (RN-46)', () => {
    renderForm();

    expect(screen.getByText('1 (peça única)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/quantidade/i)).not.toBeInTheDocument();
  });

  it('modo edição carrega a peça pelo getById e usa update, não createDraft', async () => {
    renderForm('/seller/products/7');

    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Jaqueta de couro'));
    expect(vi.mocked(sellerProductService.getById)).toHaveBeenCalledWith('7');
    expect(screen.getByLabelText('Preço')).toHaveValue('R$ 259,90');

    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));

    expect(await screen.findByRole('heading', { name: 'Revisão da peça' })).toBeInTheDocument();
    expect(vi.mocked(sellerProductService.update)).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({ name: 'Jaqueta de couro' }),
      [],
    );
    expect(vi.mocked(sellerProductService.createDraft)).not.toHaveBeenCalled();
  });

  it('não usa nenhuma cor em hex cru', async () => {
    const { container } = renderForm();
    await subirFoto();

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  // FE-US017-1 — objetivo declarado: garantir o recálculo (RN-11, RN-15).
  it('mostra quanto o vendedor recebe abaixo do preço e recalcula sem enviar', async () => {
    renderForm();
    await subirFoto();

    // Sem preço: placeholders no lugar dos valores.
    expect(screen.getByText('Você recebe')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '100,00' } });
    expect(await screen.findByText('R$ 91,00')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '200,00' } });
    expect(await screen.findByText('R$ 182,00')).toBeInTheDocument();
    expect(vi.mocked(sellerProductService.createDraft)).not.toHaveBeenCalled();
  });
});
