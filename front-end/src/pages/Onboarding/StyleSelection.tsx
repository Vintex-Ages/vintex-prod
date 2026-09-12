// src/pages/onboarding/StyleSelection.tsx
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Checkbox from '@/components/common/Checkbox';
import { getStyles } from '@/services/preferenceService';
import type { StyleOption } from '@/types/preference';

function StyleSelection() {
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

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

  function toggleStyle(value: string) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  if (loading) {
    return <p className="text-body text-texto-auxiliar">Carregando estilos...</p>;
  }

  if (error) {
    return <p className="text-body text-vermelho-escuro">Não foi possível carregar os estilos.</p>;
  }

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="font-display text-h2 text-tinta">Qual é a sua estética?</h1>
      <p className="text-body text-texto-auxiliar">
        Selecione 2 ou mais estilos para calibrar a curadoria do seu feed.
      </p>

      <ul className="flex flex-col gap-3">
        {styles.map((style) => {
          const isSelected = selected.includes(style.value);
          const inputId = `style-${style.value}`;

          return (
            <li key={style.value}>
              <label
                htmlFor={inputId}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-lg border bg-branco-quente p-3 transition-colors hover:bg-papel-profundo',
                  isSelected ? 'border-dourado' : 'border-linha',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vermelho-escuro text-branco-quente">
                  {style.label.charAt(0)}
                </span>

                <span className="flex-1 font-ui text-body font-bold text-tinta">{style.label}</span>

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
    </main>
  );
}

export default StyleSelection;
