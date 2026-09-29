import clsx from 'clsx';
import bohoIcon from '@/assets/onboarding/boho.svg';
import checkIcon from '@/assets/onboarding/check.svg';
import gothicIcon from '@/assets/onboarding/gothic.svg';
import streetwearIcon from '@/assets/onboarding/streetwear.svg';
import tailoringIcon from '@/assets/onboarding/tailoring.svg';
import vintageIcon from '@/assets/onboarding/vintage.svg';
import y2kIcon from '@/assets/onboarding/y2k.svg';
import Checkbox from '@/components/common/Checkbox';
import type { StyleOption } from '@/types/preference';

const onboardingIcons: Record<string, string> = {
  'vintage-80-90': vintageIcon,
  streetwear: streetwearIcon,
  alfaiataria: tailoringIcon,
  'gotico-dark': gothicIcon,
  'boho-romantico': bohoIcon,
  y2k: y2kIcon,
};

export type StyleSelectorProps = {
  styles: StyleOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  appearance?: 'default' | 'onboarding';
};

function StyleSelector({
  styles,
  selectedValues,
  onChange,
  disabled = false,
  appearance = 'default',
}: StyleSelectorProps) {
  function toggleStyle(value: string) {
    if (disabled) return;

    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  }

  const isOnboarding = appearance === 'onboarding';

  return (
    <ul
      className={clsx(
        'flex flex-col',
        isOnboarding ? 'gap-2.5 tablet:grid tablet:grid-cols-2 tablet:gap-4 web:grid-cols-3' : 'gap-3',
      )}
    >
      {styles.map((style) => {
        const isSelected = selectedValues.includes(style.value);
        const inputId = `style-${style.value}`;

        return (
          <li key={style.value}>
            <label
              htmlFor={inputId}
              className={clsx(
                'flex items-center border transition-colors',
                isOnboarding ? 'gap-[14px] p-[14px]' : 'min-h-touch gap-3 rounded-sm p-3',
                disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                isOnboarding
                  ? isSelected
                    ? 'border-dourado bg-branco-quente'
                    : 'border-linha bg-branco-quente hover:bg-papel-profundo'
                  : isSelected
                    ? 'border-vermelho-escuro bg-vermelho-suave'
                    : 'border-linha bg-branco-quente hover:bg-papel-profundo',
              )}
            >
              {isOnboarding ? (
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-vermelho-escuro"
                >
                  {onboardingIcons[style.value] ? <img src={onboardingIcons[style.value]} alt="" /> : null}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-papel-profundo font-display text-h4 text-tinta"
                >
                  {style.label.charAt(0)}
                </span>
              )}

              <span className={clsx('flex min-w-0 flex-1 flex-col', isOnboarding ? 'gap-0.5' : 'gap-0.5')}>
                <span
                  className={clsx(
                    'font-ui text-tinta',
                    isOnboarding
                      ? 'text-[13.5px] font-semibold leading-normal'
                      : 'text-body font-semibold',
                  )}
                >
                  {style.label}
                </span>
                {style.description && (
                  <span
                    className={clsx(
                      'text-texto-auxiliar',
                      isOnboarding
                        ? 'font-ui text-[11px] leading-[1.35]'
                        : 'text-body-sm',
                    )}
                  >
                    {style.description}
                  </span>
                )}
              </span>

              <Checkbox
                id={inputId}
                checked={isSelected}
                disabled={disabled}
                onChange={() => toggleStyle(style.value)}
                checkedMark={isOnboarding ? <img src={checkIcon} alt="" /> : undefined}
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export default StyleSelector;
