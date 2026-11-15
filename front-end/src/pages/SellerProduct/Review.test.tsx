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

  await screen.findByRole('heading', { name: 'Revise sua peça antes de publicar' });
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
    await screen.findByRole('heading', { name: 'Revise sua peça antes de publicar' });

    // Chegar à revisão não publica nada.
    expect(vi.mocked(sellerProductService.publish)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e publicar peça →' }));

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
    expect(
      within(linha('Cor principal')).getByRole('img', { name: 'Sugerido pela IA' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar dados da peça' }));
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Cor'), { target: { value: 'Verde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));
    await screen.findByRole('heading', { name: 'Revise sua peça antes de publicar' });

    // Mesmo rascunho, atualizado: a revisão mostra o valor novo, sem a marca.
    expect(within(linha('Cor principal')).getByText('Verde')).toBeInTheDocument();
    expect(within(linha('Cor principal')).queryByRole('img')).not.toBeInTheDocument();
    expect(marcasDeSugerido()).toHaveLength(4);
    expect(vi.mocked(sellerProductService.createDraft)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sellerProductService.update)).toHaveBeenLastCalledWith(
      '7',
      expect.objectContaining({ color: 'Verde' }),
      [],
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e publicar peça →' }));

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
    expect(screen.getByRole('button', { name: 'Confirmar e publicar peça →' })).toBeDisabled();
    expect(screen.getByText('Nenhuma foto adicionada.')).toBeInTheDocument();
    expect(vi.mocked(sellerProductService.publish)).not.toHaveBeenCalled();
  });

  it('NO_IMAGE vindo do back também bloqueia na revisão, sem navegar', async () => {
    vi.mocked(sellerProductService.publish).mockRejectedValue(
      new SellerProductError('NO_IMAGE', 'Adicione ao menos uma foto antes de publicar.'),
    );
    renderFluxo('/seller/products/7/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar e publicar peça →' }));

    const aviso = await screen.findByText('Adicione ao menos uma foto antes de publicar.');
    expect(aviso.closest('[role="alert"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar e publicar peça →' })).toBeDisabled();
    expect(
      screen.getByRole('heading', { name: 'Revise sua peça antes de publicar' }),
    ).toBeInTheDocument();
  });

  it('outro erro ao publicar mostra Toast de erro e mantém a revisão com os dados', async () => {
    vi.mocked(sellerProductService.publish).mockRejectedValue(new Error('rede fora'));
    renderFluxo('/seller/products/7/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar e publicar peça →' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível publicar a peça. Tente de novo.',
    );
    expect(
      screen.getByRole('heading', { name: 'Revise sua peça antes de publicar' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Jaqueta de couro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar e publicar peça →' })).toBeEnabled();
  });

  it('erro do back com mensagem própria vai para o Toast como veio', async () => {
    vi.mocked(sellerProductService.update).mockRejectedValue(
      new SellerProductError('PRODUCT_SOLD', 'Peça vendida não pode ser alterada.'),
    );
    renderFluxo('/seller/products/7/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar e publicar peça →' }));

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
    expect(within(linha('Cor principal')).getByText('Preto')).toBeInTheDocument();
    expect(within(linha('Estado de conservação')).getByText('Seminovo')).toBeInTheDocument();
    expect(within(linha('Marca / Origem')).getByText('Zara')).toBeInTheDocument();
    expect(within(linha('Quantidade')).getByText('1 (peça única)')).toBeInTheDocument();
    expect(screen.getByText('Jaqueta de couro sintético.')).toBeInTheDocument();

    const fotos = screen.getAllByRole('img', { name: /^Foto \d de 2/ });
    expect(fotos.map((foto) => foto.getAttribute('src'))).toEqual(PECA.images);
    expect(fotos[0]).toHaveAccessibleName('Foto 1 de 2 (capa)');

    const preco = screen.getByRole('region', { name: 'Preço de venda (R$)' });
    expect(within(preco).getByText('Você recebe líquido no Pix:')).toBeInTheDocument();
    // Entrando direto pela URL, nada veio da IA nesta sessão: sem marca.
    expect(marcasDeSugerido()).toHaveLength(0);
  });

  // FE-FIG-2 (#436): textos e estrutura do frame ajustado do T14.
  describe('alinhado ao frame ajustado (T14)', () => {
    it('mostra o selo da etapa, o título e o subtítulo do frame', async () => {
      renderFluxo('/seller/products/7/review');
      await screen.findByText('Jaqueta de couro');

      expect(screen.getByText('Etapa 2 de 2 • Revisão obrigatória')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Revise sua peça antes de publicar', level: 1 }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Confira os campos sugeridos pela IA. Você pode corrigir tudo antes da confirmação final.',
        ),
      ).toBeInTheDocument();
    });

    it('mostra o rótulo das fotos, a capa e o quadro "+ Foto", que leva às fotos', async () => {
      renderFluxo('/seller/products/7/review');
      await screen.findByText('Jaqueta de couro');

      expect(screen.getByText('1. Fotos e etiqueta analisadas pela IA')).toBeInTheDocument();
      expect(screen.getByText('CAPA')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '+ Foto' }));

      await waitFor(() => expect(document.activeElement?.closest('#secao-fotos')).not.toBeNull());
    });

    it('etiqueta lida pela IA mostra o quadro e o aviso "Etiqueta processada"', async () => {
      vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
        ok: true,
        suggestion: {
          fields: {
            category: 'Roupas',
            color: 'Preto',
            size: 'M',
            condition: 'Seminovo',
            composition: '100% algodão',
          },
          suggested: ['category', 'color', 'size', 'condition', 'composition'],
        },
      });

      await irParaRevisao();

      expect(screen.getByText('Etiqueta processada')).toBeInTheDocument();
      expect(screen.getByText(/a IA encontrou marca, tamanho e composição/)).toBeInTheDocument();
      expect(
        within(linha('Cor principal')).getByText('Sugerido pela IA a partir da foto.'),
      ).toBeInTheDocument();
      expect(
        within(linha('Composição da etiqueta')).getByText(
          'Extraído somente porque a etiqueta está legível.',
        ),
      ).toBeInTheDocument();
    });

    it('sem etiqueta lida, não mostra o quadro nem o aviso "Etiqueta processada"', async () => {
      renderFluxo('/seller/products/7/review');
      await screen.findByText('Jaqueta de couro');

      expect(screen.queryByText(/Etiqueta processada/)).toBeNull();
      expect(screen.queryByText(/Sugerido pela IA a partir da foto/)).toBeNull();
    });

    it('não mostra o resumo "3 de 3 · Revisão" (o selo do frame já diz a etapa) e mantém o "Voltar para Dados"', async () => {
      renderFluxo('/seller/products/7/review');
      await screen.findByText('Jaqueta de couro');

      expect(screen.queryByText('3 de 3 · Revisão')).toBeNull();
      expect(screen.getByRole('button', { name: 'Voltar para Dados' })).toBeInTheDocument();
    });

    it('o bloco de preço mostra comissão e "Você recebe líquido no Pix"', async () => {
      renderFluxo('/seller/products/7/review');
      await screen.findByText('Jaqueta de couro');

      const preco = screen.getByRole('region', { name: 'Preço de venda (R$)' });
      expect(within(preco).getByText('R$ 259,90')).toBeInTheDocument();
      expect(within(preco).getByText('Comissão Vintex (9%):')).toBeInTheDocument();
      expect(within(preco).getByText('- R$ 23,39')).toBeInTheDocument();
      expect(within(preco).getByText('Você recebe líquido no Pix:')).toBeInTheDocument();
      expect(within(preco).getByText('R$ 236,51')).toBeInTheDocument();
    });

    // O frame mostra estes itens, mas não existem na revisão: ficam como pendência (#436).
    it('não cria a caixa "Revisei…" nem o "Sugerir preço" na revisão', async () => {
      renderFluxo('/seller/products/7/review');
      await screen.findByText('Jaqueta de couro');

      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByText(/Revisei fotos/)).toBeNull();
      expect(screen.queryByRole('button', { name: /Sugerir preço/ })).toBeNull();
    });
  });

  // #331: a composição lida da etiqueta aparece ao lado de Marca/Tamanho.
  it('mostra a composição gravada na peça', async () => {
    vi.mocked(sellerProductService.getById).mockResolvedValue({
      ...PECA,
      composition: '100% algodão',
    });
    renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(within(linha('Composição da etiqueta')).getByText('100% algodão')).toBeInTheDocument();
    expect(marcasDeSugerido()).toHaveLength(0);
  });

  it('composição sugerida pela IA e não revisada aparece com a marca de sugestão', async () => {
    vi.mocked(vintexAiService.suggestListing).mockResolvedValue({
      ok: true,
      suggestion: {
        fields: {
          category: 'Roupas',
          color: 'Preto',
          size: 'M',
          condition: 'Seminovo',
          composition: '100% algodão',
        },
        suggested: ['category', 'color', 'size', 'condition', 'composition'],
      },
    });

    await irParaRevisao();

    const composicao = linha('Composição da etiqueta');
    expect(within(composicao).getByText('100% algodão')).toBeInTheDocument();
    expect(within(composicao).getByRole('img', { name: 'Sugerido pela IA' })).toBeInTheDocument();
  });

  it('sem composição, a linha aparece como "Não informado"', async () => {
    renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(within(linha('Composição da etiqueta')).getByText('Não informado')).toBeInTheDocument();
  });

  it('campo opcional vazio aparece como "Não informado"', async () => {
    vi.mocked(sellerProductService.getById).mockResolvedValue({
      ...PECA,
      brand: undefined,
      description: undefined,
    });
    renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(within(linha('Marca / Origem')).getByText('Não informado')).toBeInTheDocument();
    const descricao = screen.getByRole('region', { name: 'História e descrição da peça' });
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
    expect(
      screen.queryByRole('button', { name: 'Confirmar e publicar peça →' }),
    ).not.toBeInTheDocument();
  });

  it('falha ao carregar o rascunho mostra o erro, sem botão de publicar', async () => {
    vi.mocked(sellerProductService.getById).mockRejectedValue(new Error('404'));
    renderFluxo('/seller/products/7/review');

    expect(await screen.findByText('Não foi possível carregar esta peça.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirmar e publicar peça →' }),
    ).not.toBeInTheDocument();
  });

  it('não usa nenhuma cor em hex cru', async () => {
    const { container } = renderFluxo('/seller/products/7/review');
    await screen.findByText('Jaqueta de couro');

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  // FE-US019-2 (#221): editar peça anunciada ou pausada não passa pelo `publish`.
  // FE-US018-1 (#326), objetivo declarado 1: RN-68, o alerta não bloqueia.
  it('preço fora da faixa pedida no formulário repete o alerta e publicar segue habilitado', async () => {
    vi.spyOn(vintexAiService, 'suggestPrice').mockResolvedValue({
      min: 100,
      max: 200,
      justification: 'Peças parecidas no catálogo.',
      basedOn: 12,
    });
    renderFluxo();
    await subirFoto();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Jaqueta' } });
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '259,90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir preço' }));
    await screen.findByText('R$ 100,00 – R$ 200,00');

    fireEvent.click(screen.getByRole('button', { name: 'Continuar para revisão' }));
    await screen.findByRole('heading', { name: 'Revise sua peça antes de publicar' });

    expect(
      screen.getByText('Seu preço está acima da faixa sugerida. Você pode mantê-lo se preferir.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar e publicar peça →' })).toBeEnabled();
  });

  it('sem sugestão pedida, a revisão não mostra alerta de preço', async () => {
    await irParaRevisao();

    expect(screen.queryByText(/faixa sugerida/)).not.toBeInTheDocument();
  });

  describe('editando peça já publicada', () => {
    it.each([
      { status: 'ativo', rotulo: 'anunciada' },
      { status: 'despublicado', rotulo: 'pausada' },
    ] as const)(
      'peça $rotulo: salva as alterações sem publicar e volta ao painel',
      async ({ status }) => {
        vi.spyOn(sellerProductService, 'getById').mockResolvedValue({ ...PECA, status });
        vi.spyOn(sellerProductService, 'update').mockImplementation(async (_id, input) => ({
          ...ecoar(input),
          status,
        }));

        renderFluxo('/seller/products/7/review');

        const salvar = await screen.findByRole('button', { name: 'Salvar alterações' });
        expect(screen.queryByRole('button', { name: 'Confirmar e publicar peça →' })).toBeNull();

        fireEvent.click(salvar);

        expect(
          await screen.findByRole('heading', { name: 'Painel do vendedor' }),
        ).toBeInTheDocument();
        expect(sellerProductService.update).toHaveBeenCalledWith('7', expect.any(Object), []);
        expect(sellerProductService.publish).not.toHaveBeenCalled();
        expect(screen.getByText('Alterações salvas.')).toBeInTheDocument();
      },
    );
  });
});
