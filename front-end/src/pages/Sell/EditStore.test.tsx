import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import * as cepService from '@/services/cepService';
import * as storeService from '@/services/storeService';
import { StoreError } from '@/services/storeService';
import type { MyStoreDetails } from '@/types/store';
import EditStore from './EditStore';

/**
 * Editar a própria loja (FE-US006-4, #335). O que estes testes seguram é o
 * envio parcial do back-end#221: só vai o que mudou, e salvar sem mudar nada
 * não chama a API.
 */

const LOJA: MyStoreDetails = {
  id: '7',
  name: 'Brechó Aurora',
  description: 'Peças garimpadas',
  logoUrl: 'https://cdn.test/aurora.png',
  pixKey: 'aurora@pix.test',
  document: { type: 'cnpj', number: '12345678000199' },
  address: {
    cep: '90010000',
    street: 'Rua Ali',
    number: '120',
    district: 'Centro',
    city: 'Porto Alegre',
    state: 'RS',
  },
};

function renderEditStore() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/seller/store']}>
        <Routes>
          <Route path="/seller/store" element={<EditStore />} />
          <Route path="/seller" element={<h1>Painel do vendedor</h1>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const salvar = () => screen.getByRole('button', { name: 'Salvar alterações' });

async function carregada() {
  await waitFor(() => expect(screen.getByLabelText('Nome da loja')).toHaveValue(LOJA.name));
}

beforeEach(() => {
  vi.spyOn(storeService, 'getMyStoreDetails').mockResolvedValue(LOJA);
  vi.spyOn(storeService, 'updateMyStore').mockImplementation(async () => LOJA);
  vi.spyOn(cepService, 'lookupAddress').mockResolvedValue({
    street: 'Rua Andrade Neves',
    neighborhood: 'Centro',
    city: 'Pelotas',
    state: 'RS',
  });
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EditStore', () => {
  it('abre com os dados atuais preenchidos e o documento visível e travado', async () => {
    renderEditStore();
    await carregada();

    expect(screen.getByRole('heading', { name: 'Editar loja' })).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição (opcional)')).toHaveValue('Peças garimpadas');
    expect(screen.getByRole('img', { name: 'Pré-visualização 1' })).toHaveAttribute(
      'src',
      LOJA.logoUrl,
    );
    expect(screen.getByLabelText('CEP')).toHaveValue('90010-000');
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua Ali');
    expect(screen.getByLabelText('Chave Pix')).toHaveValue('aurora@pix.test');

    const documento = screen.getByLabelText('CNPJ');
    expect(documento).toHaveValue('12.345.678/0001-99');
    expect(documento).toBeDisabled();
  });

  it('o CEP carregado não dispara a consulta: o endereço salvo não é sobrescrito', async () => {
    renderEditStore();
    await carregada();

    expect(cepService.lookupAddress).not.toHaveBeenCalled();
  });

  it('alterar só a logo envia só a logo e volta ao painel', async () => {
    renderEditStore();
    await carregada();
    const logo = new File(['logo'], 'nova.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Logo (opcional)'), { target: { files: [logo] } });
    fireEvent.click(salvar());

    expect(await screen.findByRole('heading', { name: 'Painel do vendedor' })).toBeInTheDocument();
    expect(storeService.updateMyStore).toHaveBeenCalledWith({ logo });
    expect(screen.getByText('Loja atualizada.')).toBeInTheDocument();
  });

  it('tirar a logo envia logo nula', async () => {
    renderEditStore();
    await carregada();

    fireEvent.click(screen.getByRole('button', { name: 'Remover mídia 1' }));
    fireEvent.click(salvar());

    await screen.findByRole('heading', { name: 'Painel do vendedor' });
    expect(storeService.updateMyStore).toHaveBeenCalledWith({ logo: null });
  });

  it('alterar o endereço envia o endereço inteiro, e nada mais', async () => {
    renderEditStore();
    await carregada();

    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Complemento'), { target: { value: 'Loja 2' } });
    fireEvent.click(salvar());

    await screen.findByRole('heading', { name: 'Painel do vendedor' });
    expect(storeService.updateMyStore).toHaveBeenCalledWith({
      address: { ...LOJA.address, number: '200', complement: 'Loja 2' },
    });
  });

  it('CEP novo consulta o endereço, como na criação da loja', async () => {
    renderEditStore();
    await carregada();

    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '96010000' } });

    await waitFor(() => expect(screen.getByLabelText('Cidade')).toHaveValue('Pelotas'));
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua Andrade Neves');
  });

  it('salvar sem mudar nada não altera nada', async () => {
    renderEditStore();
    await carregada();

    fireEvent.click(salvar());

    expect(await screen.findByText('Nada mudou na sua loja.')).toBeInTheDocument();
    expect(storeService.updateMyStore).not.toHaveBeenCalled();
  });

  it('campo obrigatório vazio mostra o erro no campo e não envia', async () => {
    renderEditStore();
    await carregada();

    fireEvent.change(screen.getByLabelText('Chave Pix'), { target: { value: '' } });
    fireEvent.click(salvar());

    await waitFor(() =>
      expect(screen.getByLabelText('Chave Pix')).toHaveAccessibleDescription(
        /Informe a chave Pix\./,
      ),
    );
    expect(screen.getByLabelText('Chave Pix')).toHaveFocus();
    expect(storeService.updateMyStore).not.toHaveBeenCalled();
  });

  it('erro ao salvar mostra o aviso e mantém o que foi digitado', async () => {
    vi.mocked(storeService.updateMyStore).mockRejectedValue(
      new StoreError('INTERNAL_ERROR', 'Erro ao consultar loja.'),
    );
    renderEditStore();
    await carregada();

    fireEvent.change(screen.getByLabelText('Nome da loja'), {
      target: { value: 'Aurora Vintage' },
    });
    fireEvent.click(salvar());

    expect(
      await screen.findByText('Não foi possível salvar sua loja agora. Tente novamente.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da loja')).toHaveValue('Aurora Vintage');
  });

  it('falha ao carregar mostra o erro e deixa tentar de novo', async () => {
    vi.mocked(storeService.getMyStoreDetails)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(LOJA);
    renderEditStore();

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    await carregada();
  });

  it('sem loja, a tela não abre: volta ao painel', async () => {
    vi.mocked(storeService.getMyStoreDetails).mockResolvedValue(null);
    renderEditStore();

    expect(await screen.findByRole('heading', { name: 'Painel do vendedor' })).toBeInTheDocument();
  });
});
