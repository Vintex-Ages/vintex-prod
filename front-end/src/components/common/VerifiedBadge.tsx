import clsx from 'clsx';

export type VerifiedBadgeProps = {
  verified: boolean;
  label?: string;
};

/** Domain term for this indicator — see `.ai/glossary.md` ("Selo Confiável"). */
const DEFAULT_LABEL = 'Confiável';

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function VerifiedBadge({ verified, label }: VerifiedBadgeProps) {
  if (!verified) {
    return null;
  }

  return (
    <span
      role="status"
      aria-label={label ?? DEFAULT_LABEL}
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-verde-rs text-branco-quente',
        label ? 'gap-1.5 px-2.5 py-1 text-label' : 'h-5 w-5',
      )}
    >
      <CheckIcon />
      {label && <span>{label}</span>}
    </span>
  );
}

export default VerifiedBadge;
