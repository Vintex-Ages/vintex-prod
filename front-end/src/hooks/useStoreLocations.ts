import { useEffect, useState } from 'react';
import { searchStores } from '@/services/storeService';
import type { StoreLocation } from '@/types/catalog';

/** Teto de páginas de lojas lidas para montar as opções: evita laço sem fim se `total` vier errado. */
const MAX_PAGES = 20;

export interface StoreLocationsState {
  /** Pares cidade/UF que existem nas lojas, sem repetição, por UF e depois cidade. */
  locations: StoreLocation[];
  loading: boolean;
  /** A listagem de lojas falhou: o filtro fica sem opções, o catálogo segue. */
  error: boolean;
}

/**
 * Opções de cidade e estado do filtro do catálogo (FE-US009-5, #336).
 *
 * A localização é da loja, não da peça (back-end#108), e nenhuma rota lista as
 * cidades que existem. Então as opções saem da listagem pública de brechós
 * (`GET /api/stores`, back-end#256): só aparece cidade que tem loja. Pública,
 * funciona deslogado (RN-26).
 *
 * Usage:
 *   const { locations } = useStoreLocations();
 *   <FilterPanel locationOptions={locations} … />
 */
export function useStoreLocations(): StoreLocationsState {
  const [state, setState] = useState<StoreLocationsState>({
    locations: [],
    loading: true,
    error: false,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      const found = new Map<string, StoreLocation>();
      let seen = 0;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { items, total } = await searchStores('', page);
        for (const { city, state: uf } of items) {
          const location = { city: city.trim(), state: uf.trim().toUpperCase() };
          if (location.city && location.state) {
            found.set(`${location.state}|${location.city}`, location);
          }
        }
        seen += items.length;
        if (items.length === 0 || seen >= total) break;
      }
      return [...found.values()].sort(
        (a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city, 'pt-BR'),
      );
    }

    load()
      .then((locations) => {
        if (active) setState({ locations, loading: false, error: false });
      })
      .catch(() => {
        if (active) setState({ locations: [], loading: false, error: true });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
