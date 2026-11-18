import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Faixa de conteúdo do app — largura máxima e margem lateral, num lugar só.
 * Composição pura, sem regra de negócio.
 *
 * Existe porque a medida estava duplicada e divergente: `Header` e `Footer`
 * usavam `max-w-5xl px-6`, as páginas `max-w-5xl px-4` e o catálogo não tinha
 * largura máxima nenhuma. Na tela isso aparecia como a marca do cabeçalho
 * desalinhada do título da página por 8px em todas as rotas, e como um
 * catálogo sangrando de ponta a ponta enquanto o cabeçalho ficava centrado em
 * 1024px.
 *
 * `width`:
 * - `default` — grade de peças, cabeçalho, rodapé e conteúdo de página.
 * - `narrow` — formulário e texto corrido, onde linha longa atrapalha a
 *   leitura e o campo largo demais atrapalha o preenchimento.
 *
 * Usage:
 *   import Container from '@/components/layout/Container';
 *   <Container as="main">…</Container>
 *   <Container as="main" width="narrow">…</Container>
 */
export type ContainerProps = {
  children: ReactNode;
  /** Elemento renderizado. Default `div` — passe `main`/`section` quando o landmark for este. */
  as?: ElementType;
  width?: 'default' | 'narrow';
  className?: string;
  /** Os demais atributos nativos (aria-*, id, data-*) chegam ao elemento renderizado. */
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>;

const widthClasses: Record<NonNullable<ContainerProps['width']>, string> = {
  default: 'max-w-6xl',
  narrow: 'max-w-md',
};

function Container({
  children,
  as: Tag = 'div',
  width = 'default',
  className,
  ...rest
}: ContainerProps) {
  return (
    <Tag
      className={clsx('mx-auto w-full px-4 tablet:px-6 web:px-8', widthClasses[width], className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export default Container;
