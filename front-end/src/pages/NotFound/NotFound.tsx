import { Link } from 'react-router-dom';
import Container from '@/components/layout/Container';
import { paths } from '@/routes/paths';

/**
 * Fallback para qualquer rota que não bate com nenhuma tela declarada.
 *
 * Era um `<h1>` cru, sem estilo e sem saída. Como o 404 vive dentro do
 * esqueleto do app, a pessoa tinha o cabeçalho para voltar — mas a página em si
 * não dizia nada nem oferecia nada. Agora nomeia o que aconteceu e dá os dois
 * caminhos que existem: o feed e o catálogo.
 */
function NotFound() {
  return (
    <Container as="main" className="flex flex-col items-start gap-4 py-16 tablet:py-24">
      <p className="font-display text-display text-linha" aria-hidden="true">
        404
      </p>

      <h1 className="font-display text-h2 text-tinta">Essa página não existe</h1>

      <p className="max-w-prose text-body text-texto-auxiliar">
        O endereço pode ter mudado, ou a peça que estava aqui saiu do ar. O acervo continua no
        lugar.
      </p>

      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          to={paths.home}
          className="inline-flex min-h-touch items-center justify-center border border-vermelho-escuro bg-vermelho-escuro px-6 text-body font-semibold text-branco-quente no-underline transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente"
        >
          Voltar ao feed
        </Link>
        <Link
          to={paths.catalog}
          className="inline-flex min-h-touch items-center justify-center border-2 border-linha px-6 text-body font-semibold text-tinta no-underline transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
        >
          Ver o catálogo
        </Link>
      </div>
    </Container>
  );
}

export default NotFound;
