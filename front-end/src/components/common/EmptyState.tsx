type EmptyStateProps = {
  title?: string;
  message: string;
};

export function EmptyState({ title = 'Nenhuma peça encontrada', message }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex w-full flex-col items-center justify-center gap-2 border border-linha bg-branco-quente p-8 text-center"
    >
      <p className="font-ui text-body font-semibold text-tinta">{title}</p>

      <p className="max-w-md font-ui text-body text-texto-auxiliar">{message}</p>
    </div>
  );
}
