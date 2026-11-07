import clsx from 'clsx';

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
};

/** Circle diameter per size, reusing the project's 4px spacing scale (`spacing[7|9|12]`). */
const dimensionClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-7 w-7', // 28px
  md: 'h-9 w-9', // 36px — Figma frame `45:22291`
  lg: 'h-12 w-12', // 48px
};

const textClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'text-label',
  md: 'text-body',
  lg: 'text-body',
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '';
  }

  if (words.length === 1) {
    return words[0][0].toUpperCase();
  }

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Avatar circular do Vintex — apresentação apenas, sem regra de negócio.
 * Mostra a imagem quando `src` existe; caso contrário, mostra as iniciais
 * derivadas de `name`.
 *
 * Usage:
 *   import Avatar from '@/components/common/Avatar';
 *   <Avatar name="Ana Silva" src={fotoUrl} />
 */
function Avatar({ name, src, size = 'md' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={clsx('rounded-full object-cover', dimensionClasses[size])}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-papel-profundo text-tinta',
        dimensionClasses[size],
        textClasses[size],
      )}
    >
      {getInitials(name)}
    </span>
  );
}

export default Avatar;
