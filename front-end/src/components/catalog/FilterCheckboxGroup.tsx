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
    <fieldset>
      <legend className="mb-2 font-ui text-h4 font-semibold text-tinta">{label}</legend>

      {/*
        As opcoes fluem e quebram em vez de empilhar uma por linha: tamanho, cor
        e conservacao somam 17 valores, e numa coluna so a folha de filtros do
        celular virava uma rolagem longa por rotulos de duas ou tres letras.
      */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((option) => (
          <Checkbox
            key={option}
            id={`filter-${label}-${option}`}
            label={option}
            checked={selected.includes(option)}
            onChange={(checked) => onToggle(option, checked)}
          />
        ))}
      </div>
    </fieldset>
  );
}

export default FilterCheckboxGroup;
