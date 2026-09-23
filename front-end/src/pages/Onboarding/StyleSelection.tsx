import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import Button from '@/components/common/Button';
import Checkbox from '@/components/common/Checkbox';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { paths } from '@/routes/paths';
import { getStyles, savePreferences } from '@/services/preferenceService';
import type { Preference, StyleOption } from '@/types/preference';

/** Quantos estilos a tela pede para a curadoria fazer sentido. */
const RECOMMENDED = 2;

/**
 * Onboarding — seleção de estilos (FE-US004-1).
 *
 * Decisões da revisão visual:
 *
 * - **Carregando e erro ganham a mesma moldura da tela.** Os dois devolviam um
 *   `<p>` solto, sem `<main>` e sem margem: o texto encostava na borda
 *   esquerda da janela, colado no cabeçalho.
 * - **O estado selecionado deixa de ser `dourado`.** Dourado é "atenção — nunca
 *   CTA" na paleta; usá-lo para "selecionado" dizia alerta onde era escolha. Um
 *   fundo `vermelho-suave` ("fundo de destaque") com borda de ação diz o certo,
 *   e some a dependência de uma borda de 1px como única pista.
 * - **A contagem aparece.** O texto pedia "2 ou mais" e nada na tela dizia
 *   quantos havia — nem o botão, que oferecia salvar com zero escolhas.
 */
function StyleSelection() {
  const navigate = useNavigate();
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);

    getStyles()
      .then((data) => {
        if (active) setStyles(data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(load, [load]);

  function toggleStyle(value: string) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  const count = selected.length;

  async function handleContinue() {
    if (count > 0) {
      const prefs: Preference[] = selected.map((value) => {
        const style = styles.find((item) => item.value === value);
        return { type: style?.type ?? 'estilo', value };
      });

      try {
        await savePreferences(prefs);
      } catch {
        // Falha ao salvar não pode travar o fluxo do onboarding.
      }
    }

    navigate(paths.home);
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-6 tablet:py-10">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-h2 text-tinta">Qual é a sua estética?</h1>
          <button
            type="button"
            onClick={() => navigate(paths.home)}
            className="-mr-2 inline-flex min-h-touch shrink-0 items-center px-2 text-body-sm text-texto-auxiliar transition-colors hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            Pular
          </button>
        </div>

        <p className="max-w-prose text-body text-texto-auxiliar">
          Escolha {RECOMMENDED} ou mais estilos para calibrar a curadoria do seu feed e as
          recomendações da assistente. Dá para mudar depois.
        </p>
      </div>

      {loading ? (
        <ul className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <li
              key={index}
              className="flex animate-pulse items-center gap-3 border border-linha bg-branco-quente p-3 motion-reduce:animate-none"
            >
              <span className="h-10 w-10 shrink-0 rounded-full bg-papel-profundo" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-4 w-32 bg-papel-profundo" />
                <span className="h-3 w-48 bg-papel-profundo" />
              </span>
            </li>
          ))}
        </ul>
      ) : error ? (
        <ErrorState message="Não foi possível carregar os estilos agora." onRetry={load} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {styles.map((style) => {
              const isSelected = selected.includes(style.value);
              const inputId = `style-${style.value}`;

              return (
                <li key={style.value}>
                  <label
                    htmlFor={inputId}
                    className={clsx(
                      'flex min-h-touch cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors',
                      isSelected
                        ? 'border-vermelho-escuro bg-vermelho-suave'
                        : 'border-linha bg-branco-quente hover:bg-papel-profundo',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-papel-profundo font-display text-h4 text-tinta"
                    >
                      {style.label.charAt(0)}
                    </span>

                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="font-ui text-body font-semibold text-tinta">
                        {style.label}
                      </span>
                      {style.description && (
                        <span className="text-body-sm text-texto-auxiliar">
                          {style.description}
                        </span>
                      )}
                    </span>

                    <Checkbox
                      id={inputId}
                      checked={isSelected}
                      onChange={() => toggleStyle(style.value)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>

          {/*
            A contagem vem ANTES do botão no DOM: no celular ela fica acima da
            ação, que é a ordem em que se lê — "quantos escolhi" e depois "o que
            faço". A partir de `tablet` a linha se abre e o botão vai para a
            direita, sem trocar a ordem de leitura.
          */}
          <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
            <p aria-live="polite" className="text-body-sm text-texto-auxiliar">
              {count === 0
                ? 'Nenhum estilo escolhido ainda.'
                : count < RECOMMENDED
                  ? `${count} escolhido. Escolha mais um para a curadoria ficar melhor.`
                  : `${count} escolhidos.`}
            </p>

            <Button fullWidth className="tablet:w-auto" onClick={handleContinue}>
              {count > 0
                ? `Salvar ${count} ${count === 1 ? 'estilo' : 'estilos'} e abrir meu feed`
                : 'Abrir meu feed'}
            </Button>
          </div>
        </>
      )}
    </Container>
  );
}

export default StyleSelection;
