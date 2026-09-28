import clsx from 'clsx';
import Checkbox from '@/components/common/Checkbox';
import type { StyleOption } from '@/types/preference';

export type StyleSelectorProps = {
  styles: StyleOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
};

function StyleSelector({ styles, selectedValues, onChange, disabled = false }: StyleSelectorProps) {
  function toggleStyle(value: string) {
    if (disabled) return;

    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {styles.map((style) => {
        const isSelected = selectedValues.includes(style.value);
        const inputId = `style-${style.value}`;

        return (
          <li key={style.value}>
            <label
              htmlFor={inputId}
              className={clsx(
                'flex min-h-touch items-center gap-3 rounded-sm border p-3 transition-colors',
                disabled ? 'cursor-not-allowed' : 'cursor-pointer',
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
                <span className="font-ui text-body font-semibold text-tinta">{style.label}</span>
                {style.description && (
                  <span className="text-body-sm text-texto-auxiliar">{style.description}</span>
                )}
              </span>

              <Checkbox
                id={inputId}
                checked={isSelected}
                disabled={disabled}
                onChange={() => toggleStyle(style.value)}
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export default StyleSelector;
