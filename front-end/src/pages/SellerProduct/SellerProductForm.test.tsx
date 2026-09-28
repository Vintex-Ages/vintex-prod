import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
        <Route path="/seller/products/new" element={<SellerProductForm />} />
        <Route path="/seller/products/:id" element={<SellerProductForm />} />
        <Route path="/product/:id" element={<h1>Detalhe da peça</h1>} />
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

  it('publicar sem foto cobra a foto e não chama o service (RN-47)', async () => {
    renderForm();
    preencherObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar peça' }));

    await waitFor(() =>
      expect(screen.getByText('Adicione ao menos uma foto.')).toBeInTheDocument(),
    );
    expect(vi.mocked(sellerProductService.createDraft)).not.toHaveBeenCalled();
  });

  it('publicar sem os campos obrigatórios mostra o erro em cada campo', async () => {
    renderForm();
    await subirFoto();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar peça' }));

    await waitFor(() => expect(screen.getByText('Dê um título para a peça.')).toBeInTheDocument());
    expect(screen.getByText('Informe o preço.')).toBeInTheDocument();
    expect(vi.mocked(sellerProductService.createDraft)).not.toHaveBeenCalled();
  });

  it('publicar salva o rascunho em reais, publica e vai para o detalhe', async () => {
    renderForm();
    await subirFoto();
    preencherObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar peça' }));

    await waitFor(() => expect(vi.mocked(sellerProductService.createDraft)).toHaveBeenCalled());
    const [input] = vi.mocked(sellerProductService.createDraft).mock.calls[0];
    // `PriceInput` entrega centavos; `ProductInput.price` é em reais.
    expect(input.price).toBe(259.9);
    expect(input.quantity).toBe(1);
    expect(input.images).toEqual(['https://api.test/api/media/products/photos/abc']);

    expect(vi.mocked(sellerProductService.publish)).toHaveBeenCalledWith('7');
    expect(await screen.findByRole('heading', { name: 'Detalhe da peça' })).toBeInTheDocument();
  });

  it('manda a correção do vendedor sobre a sugestão, para o back guardar', async () => {
    renderForm();
    await subirFoto();
    await waitFor(() => expect(screen.getByLabelText('Cor')).toHaveValue('Preto'));

    fireEvent.change(screen.getByLabelText('Cor'), { target: { value: 'Verde' } });
    preencherObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar peça' }));

    await waitFor(() => expect(vi.mocked(sellerProductService.createDraft)).toHaveBeenCalled());
    const [, corrections] = vi.mocked(sellerProductService.createDraft).mock.calls[0];
    expect(corrections).toEqual([{ field: 'color', suggested: 'Preto', final: 'Verde' }]);
  });

  it('erro do service ao publicar aparece na tela, sem navegar', async () => {
    vi.mocked(sellerProductService.createDraft).mockRejectedValue(
      new Error('Peça sem foto não pode ser publicada.'),
    );
    renderForm();
    await subirFoto();
    preencherObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar peça' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Peça sem foto não pode ser publicada.'),
    );
    expect(screen.queryByRole('heading', { name: 'Detalhe da peça' })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Publicar peça' }));

    await waitFor(() => expect(vi.mocked(sellerProductService.update)).toHaveBeenCalled());
    expect(vi.mocked(sellerProductService.createDraft)).not.toHaveBeenCalled();
  });

  it('não usa nenhuma cor em hex cru', async () => {
    const { container } = renderForm();
    await subirFoto();

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
