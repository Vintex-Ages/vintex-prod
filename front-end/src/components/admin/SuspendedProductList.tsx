import { useState } from 'react';
import Button from '@/components/common/Button';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import StatusBadge from '@/components/product/StatusBadge';
import type { SuspendedProduct } from '@/types/adminModeration';

interface SuspendedProductListProps {
  items: SuspendedProduct[];
  restoringIds: ReadonlySet<string>;
  restoreErrors: Record<string, string>;
  onRestore: (id: string) => void;
  disabled?: boolean;
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function moderationDate(value: string | undefined): { dateTime: string; label: string } | null {
  if (!value) return null;
  // Contrato UTC-naive da #432, confirmado para esta tela: apenas timestamps
  // ISO completos sem offset recebem Z na apresentação. O service fica intacto.
  const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.exec(
    value,
  );
  if (!iso) return null;
  const dateTime = iso[4] ? value : `${value}Z`;
  const date = new Date(dateTime);
  // Date normaliza dias impossíveis em alguns browsers; não os apresenta como
  // uma data real de moderação. Confere também os componentes do calendário.
  const [year, month, day] = iso[1].split('-').map(Number);
  const [hour, minute, second] = iso[2].split(':').map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (
    !Number.isFinite(date.getTime()) ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  return { dateTime, label: dateFormat.format(date) };
}

function ProductPhoto({ item }: { item: SuspendedProduct }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden border border-linha bg-papel-profundo tablet:h-16 tablet:w-16">
      {item.coverImageUrl && item.coverImageUrl !== failedUrl ? (
        <img
          src={item.coverImageUrl}
          alt={item.name}
          onError={() => setFailedUrl(item.coverImageUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        <ProductImagePlaceholder productName={item.name} />
      )}
    </div>
  );
}

/** Cartões de apresentação: ordem e pertencimento à lista vêm do service. */
export function SuspendedProductList({
  items,
  restoringIds,
  restoreErrors,
  onRestore,
  disabled = false,
}: SuspendedProductListProps) {
  return (
    <ul aria-label="Anúncios suspensos" className="flex flex-col gap-4">
      {items.map((item) => {
        const date = moderationDate(item.moderatedAt);
        const restoring = restoringIds.has(item.id);
        const error = restoreErrors[item.id];
        return (
          <li key={item.id} aria-busy={restoring}>
            <article className="flex min-w-0 flex-col gap-4 border border-linha bg-branco-quente p-4 tablet:p-5 web:flex-row web:items-start web:gap-6">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <ProductPhoto item={item} />
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words font-ui text-body font-bold text-tinta">
                      {item.name}
                    </h2>
                    <p className="break-words font-ui text-body-sm text-texto-auxiliar">
                      {item.store.name}
                    </p>
                  </div>
                  <span className="shrink-0 [&>span]:text-texto-auxiliar">
                    <StatusBadge status="despublicado" label="Suspensa" size="sm" />
                  </span>
                </div>
                <div className="flex flex-col gap-2 border-t border-linha pt-3 font-ui text-body-sm text-texto-auxiliar">
                  <p className="whitespace-pre-line break-words">
                    <span className="font-semibold">Motivo: </span>
                    {item.moderationReason?.trim() ? item.moderationReason : 'Motivo não informado'}
                  </p>
                  {date ? (
                    <p>
                      Moderação em <time dateTime={date.dateTime}>{date.label}</time>
                    </p>
                  ) : (
                    <p>Data da moderação não informada</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-3 web:w-64 web:shrink-0">
                <Button
                  variant="outline"
                  disabled={restoring || disabled}
                  aria-busy={restoring}
                  onClick={() => onRestore(item.id)}
                >
                  {restoring ? 'Restaurando…' : 'Restaurar anúncio'}
                </Button>
                {error ? (
                  <p role="alert" className="break-words font-ui text-body-sm text-vermelho-escuro">
                    {error}
                  </p>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
