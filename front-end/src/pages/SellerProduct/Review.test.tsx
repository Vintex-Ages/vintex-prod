import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { paths } from '@/routes/paths';
import * as sellerProductService from '@/services/sellerProductService';
import { SellerProductError } from '@/services/sellerProductService';
import * as vintexAiService from '@/services/vintexAiService';
import type { ProductInput, SellerProductDetail } from '@/types/product';
import Review from './Review';
import SellerProductFlow from './SellerProductFlow';
import SellerProductForm from './SellerProductForm';

/**
 * Revisão e publicação explícita (FE-US016-1, #218).
 *
 * Os testes rodam o fluxo inteiro (formulário → revisão → publicar) em cima do
 * mesmo `SellerProductFlow` das rotas reais: o que está em jogo é justamente o
 * que atravessa as duas telas — a marca de sugerido e as correções sobre a IA,
 * que só existem no cliente até o último `update`.
 */

const FOTO_URL = 'https://api.test/api/media/products/photos/abc';

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
  images: [FOTO_URL, 'https://api.test/api/media/products/photos/costas'],
  quantity: 1,
  store: { id: '1', name: 'Brechó da Ana', city: 'Porto Alegre' },
  aiCorrections: [],
};

/** Igual ao back: devolve a peça com o que acabou de ser gravado. */
function ecoar(input: Partial<ProductInput>): SellerProductDetail {
  return { ...PECA, ...input, images: input.images ?? PECA.images, quantity: 1 };
}

function renderFluxo(rota: string = paths.sellerProductNew) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[rota]}>
        {/* Como o link "Nova peça" do cabeçalho: sai do rascunho sem sair do fluxo. */}
        <Link to={paths.sellerProductNew}>Começar outra peça</Link>
        <Routes>
          <Route element={<SellerProductFlow />}>
            <Route path={paths.sellerProductNew} element={<SellerProductForm />} />
            <Route path={paths.sellerProduct} element={<SellerProductForm />} />
            <Route path={paths.sellerProductReview} element={<Review />} />
          </Route>
          <Route path={paths.seller} element={<h1>Painel do vendedor</h1>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function subirFoto() {
  fireEvent.change(screen.getByLabelText('Fotos da peça'), {
    target: { files: [new File(['conteudo'], 'frente.jpg', { type: 'image/jpeg' })] },
  });
  await waitFor(() => expect(screen.getByLabelText('Cor')).toHaveValue('Preto'));
}

/** Cadastro novo até a revisão, deixando os campos da IA como vieram. */
async function irParaRevisao() {
  renderFluxo();
  await subirFoto();
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Jaqueta' } });
  fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '259,90' } });

  fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));

  await screen.findByRole('heading', { name: 'Revisar anúncio' });
}

function marcasDeSugerido() {
  return screen.queryAllByRole('img', { name: 'Sugerido pela IA' });
}

/** Linha do resumo (`dt` + `dd`) de um campo. */
function linha(rotulo: string) {
  const dt = screen.getByText(rotulo, { selector: 'dt, dt *' }).closest('div');
  if (!dt) throw new Error(`linha ${rotulo} não encontrada`);
  return dt;
}

beforeEach(() => {
  vi.spyOn(sellerProductService, 'uploadMedia').mockResolvedValue([FOTO_URL]);
  vi.spyOn(sellerProductService, 'createDraft').mockImplementation(async (input) => ecoar(input));
  vi.spyOn(sellerProductService, 'update').mockImplementation(async (_id, input) => ecoar(input));
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
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Review', () => {
  // Objetivo declarado 1: confirmação explícita (RN-50) e registro das correções.
  it('publicar manda as correções no último update, publica e volta ao painel com aviso', async () => {
    renderFluxo();
    await subirFoto();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Jaqueta' } });
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '259,90' } });
    fireEvent.change(screen.getByLabelText('Cor'), { target: { value: 'Verde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));
    await screen.findByRole('heading', { name: 'Revisar anúncio' });

    // Chegar à revisão não publica nada.
    expect(vi.mocked(sellerProductService.publish)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('heading', { name: 'Painel do vendedor' })).toBeInTheDocument();
    expect(vi.mocked(sellerProductService.update)).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({ name: 'Jaqueta', color: 'Verde', price: 259.9 }),
      [{ field: 'color', suggested: 'Preto', final: 'Verde' }],
    );
    expect(vi.mocked(sellerProductService.publish)).toHaveBeenCalledWith('7');
    // O `update` com as correções vem antes do `publish`, que não tem corpo.
    expect(vi.mocked(sellerProductService.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sellerProductService.publish).mock.invocationCallOrder[0],
    );
    expect(screen.getByRole('status')).toHaveTextContent(/publicada/i);
  });

  // Objetivo declarado 2: "correção sobrescreve a IA".
  it('editar um campo pela revisão tira a marca de sugerido e vira correção no publicar', async () => {
    await irParaRevisao();
    expect(marcasDeSugerido()).toHaveLength(5);
    expect(within(linha('Cor')).getByRole('img', { name: 'Sugerido pela IA' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar dados da peça' }));
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Cor'), { target: { value: 'Verde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));
    await screen.findByRole('heading', { name: 'Revisar anúncio' });

    // Mesmo rascunho, atualizado: a revisão mostra o valor novo, sem a marca.
    expect(within(linha('Cor')).getByText('Verde')).toBeInTheDocument();
    expect(within(linha('Cor')).queryByRole('img')).not.toBeInTheDocument();
    expect(marcasDeSugerido()).toHaveLength(4);
    expect(vi.mocked(sellerProductService.createDraft)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sellerProductService.update)).toHaveBeenLastCalledWith(
      '7',
      expect.objectContaining({ color: 'Verde' }),
      [],
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

    await screen.findByRole('heading', { name: 'Painel do vendedor' });
    expect(vi.mocked(sellerProductService.update)).toHaveBeenLastCalledWith(
      '7',
      expect.objectContaining({ color: 'Verde' }),
      [{ field: 'color', suggested: 'Preto', final: 'Verde' }],
    );
  });

  // Objetivo declarado 3: RN-47 na revisão.
  it('rascunho sem foto bloqueia o publicar com mensagem clara (NO_IMAGE)', async () => {
    vi.mocked(sellerProductService.getById).mockResolvedValue({ ...PECA, images: [] });
    renderFluxo('/seller/products/7/review');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Adicione ao menos uma foto antes de publicar.',
    );
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByText('Nenhuma foto adicionada.')).toBeInTheDocument();
    expect(vi.mocked(sellerProductService.publish)).not.toHaveBeenCalled();
  });

  it('NO_IMAGE vindo do back também bloqueia na revisão, sem navegar', async () => {
    vi.mocked(sellerProductService.publish).mockRejectedValue(
      new SellerProductError('NO_IMAGE', 'Adicione ao menos uma foto antes de publicar.'),
    );
    renderFluxo('/seller/products/7/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));

    const aviso = await screen.findByText('Adicione ao menos uma foto antes de publicar.');
    expect(aviso.closest('[role="alert"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Revisar anúncio' })).toBeInTheDocument();
  });

  it('outro erro ao publicar mostra Toast de erro e mantém a revisão com os dados', async () => {
    vi.mocked(sellerProductService.publish).mockRejectedValue(new Error('rede fora'));
    renderFluxo('/seller/products/7/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível publicar a peça. Tente de novo.',
    );
    expect(screen.getByRole('heading', { name: 'Revisar anúncio' })).toBeInTheDocument();
    expect(screen.getByText('Jaqueta de couro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  it('erro do back com mensagem própria vai para o Toast como veio', async () => {
    vi.mocked(sellerProductService.update).mockRejectedValue(
      new SellerProductError('PRODUCT_SOLD', 'Peça vendida não pode ser alterada.'),
    );
    renderFluxo('/seller/products/7/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Peça vendida não pode ser alterada.',
    );
    expect(vi.mocked(sellerProductService.publish)).not.toHaveBeenCalled();
  });

  it('mostra todos os campos do RN-49, as fotos na ordem e o líquido ao lado do preço', async () => {
    renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(within(linha('Categoria')).getByText('Roupas')).toBeInTheDocument();
    expect(within(linha('Tamanho')).getByText('M')).toBeInTheDocument();
    expect(within(linha('Cor')).getByText('Preto')).toBeInTheDocument();
    expect(within(linha('Conservação')).getByText('Seminovo')).toBeInTheDocument();
    expect(within(linha('Marca')).getByText('Zara')).toBeInTheDocument();
    expect(within(linha('Quantidade')).getByText('1 (peça única)')).toBeInTheDocument();
    expect(screen.getByText('Jaqueta de couro sintético.')).toBeInTheDocument();

    const fotos = screen.getAllByRole('img', { name: /^Foto \d de 2/ });
    expect(fotos.map((foto) => foto.getAttribute('src'))).toEqual(PECA.images);
    expect(fotos[0]).toHaveAccessibleName('Foto 1 de 2 (capa)');

    const preco = screen.getByRole('region', { name: 'Preço' });
    expect(within(preco).getByText('Você recebe')).toBeInTheDocument();
    // Entrando direto pela URL, nada veio da IA nesta sessão: sem marca.
    expect(marcasDeSugerido()).toHaveLength(0);
  });

  it('campo opcional vazio aparece como "Não informado"', async () => {
    vi.mocked(sellerProductService.getById).mockResolvedValue({
      ...PECA,
      brand: undefined,
      description: undefined,
    });
    renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(within(linha('Marca')).getByText('Não informado')).toBeInTheDocument();
    const descricao = screen.getByRole('region', { name: 'Descrição' });
    expect(within(descricao).getByText('Não informado')).toBeInTheDocument();
  });

  it.each([
    ['Editar preço', 'Preço'],
    ['Editar descrição', 'Descrição'],
    ['Editar dados da peça', 'Título'],
  ])('"%s" volta ao formulário focando %s', async (botao, campo) => {
    renderFluxo('/seller/products/7/review');

    fireEvent.click(await screen.findByRole('button', { name: botao }));

    await waitFor(() => expect(screen.getByLabelText(campo)).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Continuar para revisão' })).toBeInTheDocument();
  });

  it('"Editar fotos" volta ao formulário na área de fotos', async () => {
    renderFluxo('/seller/products/7/review');

    fireEvent.click(await screen.findByRole('button', { name: 'Editar fotos' }));

    await waitFor(() => expect(document.activeElement?.closest('#secao-fotos')).not.toBeNull());
  });

  it('Stepper marca Revisão como etapa atual e deixa voltar para Dados', async () => {
    const { container } = renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(container.querySelector('[aria-current="step"]')).toHaveTextContent('Revisão');

    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Dados' }));

    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveFocus());
  });

  it('ir para "Nova peça" com um rascunho em memória começa do zero, sem regravar o anterior', async () => {
    await irParaRevisao();

    fireEvent.click(screen.getByRole('link', { name: 'Começar outra peça' }));

    expect(await screen.findByRole('heading', { name: 'Nova peça' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
    expect(screen.getByLabelText('Cor')).toHaveValue('');
    expect(marcasDeSugerido()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Continuar para revisão' })).toBeDisabled();
  });

  it('mostra o carregamento enquanto busca o rascunho', () => {
    vi.mocked(sellerProductService.getById).mockReturnValue(new Promise(() => {}));
    renderFluxo('/seller/products/7/review');

    expect(screen.getByRole('status')).toHaveTextContent('Carregando a peça...');
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
  });

  it('falha ao carregar o rascunho mostra o erro, sem botão de publicar', async () => {
    vi.mocked(sellerProductService.getById).mockRejectedValue(new Error('404'));
    renderFluxo('/seller/products/7/review');

    expect(await screen.findByText('Não foi possível carregar esta peça.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
  });

  it('não usa nenhuma cor em hex cru', async () => {
    const { container } = renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
