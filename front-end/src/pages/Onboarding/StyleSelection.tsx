import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import aiBadgeIcon from '@/assets/onboarding/ai-badge.svg';
import backIcon from '@/assets/onboarding/back.svg';
import brand from '@/assets/onboarding/brand.svg';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import StyleSelector from '@/components/preferences/StyleSelector';
import { paths } from '@/routes/paths';
import { getPreferences, getStyles, savePreferences } from '@/services/preferenceService';
import type { Preference, StyleOption } from '@/types/preference';

const CLOTHING_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG+'];
const SHOE_SIZES = ['35-', '35', '36', '37', '38', '39', '40', '41', '42+'];
const FIGMA_DEFAULT_STYLES = ['vintage-80-90', 'alfaiataria', 'boho-romantico'];
const FIGMA_DEFAULT_CLOTHING_SIZES = ['P', 'M'];
const FIGMA_DEFAULT_SHOE_SIZES = ['37', '38'];
const CLOTHING_SIZE_TYPE = 'tamanho_roupa';
const SHOE_SIZE_TYPE = 'tamanho_calcado';

function SizeOptions({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex w-full gap-1.5">
      {options.map((value) => {
        const isSelected = selected.includes(value);

        return (
          <button
            key={value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(value)}
            className={clsx(
              'min-w-0 flex-1 rounded-[5px] border px-1 py-[9px] font-ui text-[11.5px] font-bold leading-normal transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro',
              isSelected
                ? 'border-vermelho-escuro bg-vermelho-escuro text-branco-quente'
                : 'border-linha bg-branco-quente text-tinta hover:bg-papel-profundo',
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function SizePanel({
  title,
  description,
  label,
  options,
  selected,
  onChange,
}: {
  title: string;
  description: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (value: string) => void;
}) {
  return (
    <section className="flex w-full flex-col gap-3 border border-linha bg-branco-quente p-[18px]">
      <h2 className="font-ui text-[15px] font-bold leading-normal text-tinta">{title}</h2>
      <p className="font-ui text-[11.5px] leading-normal text-texto-auxiliar">{description}</p>
      <SizeOptions label={label} options={options} selected={selected} onChange={onChange} />
    </section>
  );
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** Onboarding de estilos e tamanhos (FE-US004-1). */
function StyleSelection() {
  const navigate = useNavigate();
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [clothingSizes, setClothingSizes] = useState<string[]>([]);
  const [shoeSizes, setShoeSizes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);

    Promise.all([getStyles(), getPreferences()])
      .then(([availableStyles, preferences]) => {
        if (!active) return;

        setStyles(availableStyles);
        if (preferences.length === 0) {
          setSelectedStyles(
            FIGMA_DEFAULT_STYLES.filter((value) =>
              availableStyles.some((style) => style.value === value),
            ),
          );
          setClothingSizes(FIGMA_DEFAULT_CLOTHING_SIZES);
          setShoeSizes(FIGMA_DEFAULT_SHOE_SIZES);
        } else {
          setSelectedStyles(
            preferences
              .filter((preference) => preference.type === 'estilo')
              .map((preference) => preference.value),
          );
          setClothingSizes(
            preferences
              .filter((preference) => preference.type === CLOTHING_SIZE_TYPE)
              .map((preference) => preference.value),
          );
          setShoeSizes(
            preferences
              .filter((preference) => preference.type === SHOE_SIZE_TYPE)
              .map((preference) => preference.value),
          );
        }
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

  async function saveAndOpenFeed() {
    const preferences: Preference[] = [
      ...selectedStyles.flatMap((value) => {
        const style = styles.find((item) => item.value === value);
        return style ? [{ type: style.type, value }] : [];
      }),
      ...clothingSizes.map((value) => ({ type: CLOTHING_SIZE_TYPE, value })),
      ...shoeSizes.map((value) => ({ type: SHOE_SIZE_TYPE, value })),
    ];

    if (preferences.length > 0) {
      await savePreferences(preferences).catch(() => {
        // A falha ao salvar não impede a pessoa de abrir o feed.
      });
    }

    navigate(paths.home);
  }

  return (
    <div className="min-h-screen bg-papel">
      <div className="mx-auto min-h-screen w-full max-w-6xl bg-white">
        <header className="border-t border-linha bg-papel">
          <div className="relative flex h-[68px] items-center justify-between border-b border-linha px-4">
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => navigate(-1)}
              className="-ml-[5px] grid size-11 shrink-0 place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              <span className="grid size-[34px] place-items-center bg-vermelho-escuro">
                <img src={backIcon} alt="" />
              </span>
            </button>
            <img
              src={brand}
              alt="Vintex"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
            <button
              type="button"
              onClick={() => navigate(paths.home)}
              className="-mr-[5px] grid min-h-11 place-items-center px-1 font-ui text-[11px] font-bold tracking-[0.66px] text-texto-auxiliar focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              PULAR
            </button>
          </div>
        </header>

        <main className="flex flex-col gap-4 px-5 pb-10 pt-6 tablet:px-6 tablet:pt-8 web:gap-5 web:px-8 web:py-10">
          <div className="relative flex w-full items-center justify-center gap-1 border border-verde-rs/30 bg-[#e7efe9] px-4 py-2 web:mx-auto web:w-fit">
            <img src={aiBadgeIcon} alt="" className="h-[15.869px] w-[16.017px] shrink-0" />
            <span className="font-ui text-[10px] font-bold uppercase leading-none text-verde-rs">
              Personalização com IA
            </span>
          </div>

          <h1 className="font-display text-[26px] leading-normal text-tinta web:text-center web:text-[34px]">
            Qual é a sua estética?
          </h1>
          <p className="font-ui text-[13px] leading-[1.45] text-texto-auxiliar web:mx-auto web:max-w-[620px] web:text-center">
            Selecione 2 ou mais estilos para calibrar a curadoria inteligente do seu feed e as
            recomendações da assistente.
          </p>

          {loading ? (
            <ul
              className="flex flex-col gap-2.5 tablet:grid tablet:grid-cols-2 tablet:gap-4 web:grid-cols-3"
              aria-hidden="true"
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <li
                  key={index}
                  className="h-[77px] animate-pulse border border-linha bg-branco-quente"
                />
              ))}
            </ul>
          ) : error ? (
            <ErrorState message="Não foi possível carregar os estilos agora." onRetry={load} />
          ) : (
            <>
              <StyleSelector
                styles={styles}
                selectedValues={selectedStyles}
                onChange={setSelectedStyles}
                appearance="onboarding"
              />

              <div className="flex flex-col gap-4 web:grid web:grid-cols-2">
                <SizePanel
                  title="Tamanhos Usuais de Roupas"
                  description="Filtre automaticamente achados no seu número:"
                  label="Tamanhos de roupas"
                  options={CLOTHING_SIZES}
                  selected={clothingSizes}
                  onChange={(value) => setClothingSizes((current) => toggleValue(current, value))}
                />
                <SizePanel
                  title="Numeração de Calçados"
                  description="Mostramos primeiro os sapatos e tênis do seu tamanho:"
                  label="Numeração de calçados"
                  options={SHOE_SIZES}
                  selected={shoeSizes}
                  onChange={(value) => setShoeSizes((current) => toggleValue(current, value))}
                />
              </div>

              <Button
                fullWidth
                className="h-[45px] px-0 text-[12px] tracking-[0.48px] tablet:w-fit tablet:self-end tablet:px-8"
                onClick={saveAndOpenFeed}
              >
                SALVAR ESTILOS E ABRIR MEU FEED
              </Button>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default StyleSelection;
