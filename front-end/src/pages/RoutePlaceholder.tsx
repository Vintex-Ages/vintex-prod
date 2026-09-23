import { EmptyState } from '@/components/common/EmptyState';
import Container from '@/components/layout/Container';

interface RoutePlaceholderProps {
  /** Vira o `<h1>` da página — cada rota nova precisa do próprio título. */
  title: string;
  message?: string;
}

/**
 * Placeholder mínimo de rota nova (FE-FND-4, #205): título + `EmptyState`,
 * dentro do mesmo `Container` que as páginas reais usam. Existe só pra
 * declarar a rota antes da tela de verdade — cada task de tela (ex.: #212,
 * #213, #216, #220, #223, #225/#226, #72) substitui o próprio placeholder
 * pela implementação final, sem mexer em `AppRoutes.tsx`.
 *
 * Usage:
 *   import { RoutePlaceholder } from '@/pages/RoutePlaceholder';
 *
 *   function Cart() {
 *     return <RoutePlaceholder title="Carrinho" />;
 *   }
 */
export function RoutePlaceholder({
  title,
  message = 'Essa tela ainda não foi implementada.',
}: RoutePlaceholderProps) {
  return (
    <Container as="main" className="flex flex-col gap-6 py-10">
      <h1 className="font-display text-h2 text-tinta">{title}</h1>
      <EmptyState message={message} />
    </Container>
  );
}
