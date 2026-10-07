import { FilterChip } from '@/components/catalog/FilterChip';
import Button from '@/components/common/Button';
import type { FilterParams } from '@/types/product';
import type { InterpretedQuery } from '@/types/vintex-ai';
import { formatCentsToBRL } from '@/utils/format';

export type InterpretedQueryChipsProps = {
  interpreted: InterpretedQuery;
  /** Abre o catálogo com os filtros objetivos; quem chama monta a rota. */
  onOpenCatalog: () => void;
};

function brl(reais: number): string {
  return formatCentsToBRL(Math.round(reais * 100));
}

/** Rótulo da faixa de preço: "até R$ 100,00", "a partir de R$ 50,00" ou "R$ 50,00 a R$ 100,00". */
function priceLabel({ priceMin, priceMax }: FilterParams): string | null {
  if (priceMin !== undefined && priceMax !== undefined)
    return `${brl(priceMin)} a ${brl(priceMax)}`;
  if (priceMax !== undefined) return `até ${brl(priceMax)}`;
  if (priceMin !== undefined) return `a partir de ${brl(priceMin)}`;
  return null;
}

/** Um rótulo por filtro objetivo, na ordem em que se lê um pedido: o quê, cor, tamanho… */
function chipLabels(filters: FilterParams): string[] {
  const labels = [
    filters.category,
    filters.color,
    filters.size && `Tamanho ${filters.size}`,
    filters.condition,
    filters.brand,
    priceLabel(filters),
    filters.city,
  ];
  return labels.filter((label): label is string => Boolean(label && label.trim()));
}

/**
 * Como a Vintex entendeu a pergunta (FE-US027-3, RN-60): os critérios
 * objetivos viram chips ("Casaco · Preto · até R$ 100,00") e o subjetivo
 * aparece como "parecido com: streetwear". Chips e "Ver no catálogo" levam à
 * busca tradicional com os mesmos filtros — a ponte entre conversa e catálogo.
 *
 * Sem filtro nem similaridade, não renderiza nada.
 *
 * Usage:
 *   {message.interpreted && (
 *     <InterpretedQueryChips interpreted={message.interpreted} onOpenCatalog={abrirCatalogo} />
 *   )}
 */
function InterpretedQueryChips({ interpreted, onOpenCatalog }: InterpretedQueryChipsProps) {
  const labels = chipLabels(interpreted.filters);
  const similarity = interpreted.similarity?.trim();

  if (labels.length === 0 && !similarity) return null;

  return (
    <section
      aria-label="Como a Vintex entendeu seu pedido"
      className="mt-2 flex flex-col gap-2 border border-linha bg-branco-quente p-3"
    >
      <p className="font-ui text-label text-texto-auxiliar">A Vintex entendeu:</p>

      {labels.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <li key={label}>
              <FilterChip label={label} onToggle={onOpenCatalog} />
            </li>
          ))}
        </ul>
      )}

      {similarity && (
        <p className="font-ui text-body-sm text-tinta">
          parecido com: <span className="font-semibold">{similarity}</span>
        </p>
      )}

      {labels.length > 0 && (
        <div>
          <Button variant="quiet" onClick={onOpenCatalog}>
            Ver no catálogo
          </Button>
        </div>
      )}
    </section>
  );
}

export default InterpretedQueryChips;
