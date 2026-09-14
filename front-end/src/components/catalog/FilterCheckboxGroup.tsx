import Checkbox from '@/components/common/Checkbox';

type FilterCheckboxGroupProps = {
  label: string;
  options: string[];
  selected?: string[];
  onToggle: (value: string, checked: boolean) => void;
};

/**
 * Grupo reutilizável de opções para filtros com múltipla seleção.
 *
 * Sem opções, não renderiza nada: um `fieldset` só com a legenda desenha um
 * título solto sem nada embaixo, que é como o painel de filtros aparecia para
 * tamanho, marca, conservação e cor.
 */
function FilterCheckboxGroup({
  label,
  options,
  selected = [],
  onToggle,
}: FilterCheckboxGroupProps) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-ui text-h4 font-semibold text-tinta">{label}</legend>

      {options.map((option) => (
        <Checkbox
          key={option}
          id={`filter-${label}-${option}`}
          label={option}
          checked={selected.includes(option)}
          onChange={(checked) => onToggle(option, checked)}
        />
      ))}
    </fieldset>
  );
}

export default FilterCheckboxGroup;
