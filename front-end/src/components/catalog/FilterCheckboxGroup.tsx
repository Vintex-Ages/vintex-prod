import Checkbox from '@/components/common/Checkbox';

type FilterCheckboxGroupProps = {
  label: string;
  options: string[];
  selected?: string[];
  onToggle: (value: string, checked: boolean) => void;
};

/**
 * Grupo reutilizável de opções para filtros com múltipla seleção.
 */
function FilterCheckboxGroup({
  label,
  options,
  selected = [],
  onToggle,
}: FilterCheckboxGroupProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-ui text-body font-semibold text-tinta">{label}</legend>

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
