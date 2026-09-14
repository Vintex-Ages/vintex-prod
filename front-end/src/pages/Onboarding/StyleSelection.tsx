// src/pages/onboarding/StyleSelection.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import Button from '@/components/common/Button';
import Checkbox from '@/components/common/Checkbox';
import { paths } from '@/routes/paths';
import { getStyles } from '@/services/preferenceService';
import type { StyleOption } from '@/types/preference';

function StyleSelection() {
  const navigate = useNavigate();
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-h2 text-tinta">Qual é a sua estética?</h1>
        <button
          type="button"
          onClick={() => navigate(paths.home)}
          className="shrink-0 text-label font-bold uppercase tracking-wide text-texto-auxiliar hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
        >
          Pular
        </button>
      </div>
      <p className="text-body text-texto-auxiliar">
        Selecione 2 ou mais estilos para calibrar a curadoria inteligente do seu feed e as
        recomendações da assistente.
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

                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="font-ui text-body font-bold text-tinta">{style.label}</span>
                  {style.description && (
                    <span className="text-label text-texto-auxiliar">{style.description}</span>
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

      <Button className="mt-3" fullWidth onClick={() => navigate(paths.home)}>
        Salvar estilos e abrir meu feed
      </Button>
    </main>
  );
}

export default StyleSelection;
