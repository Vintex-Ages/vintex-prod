import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import { useToast } from '@/context/useToast';
import { useStoreVerification } from '@/hooks/useStoreVerification';

/**
 * Card "Selo Confiável" do painel do vendedor (FE-US007-1, #224, RN-72/73):
 * mostra a situação do selo e, enquanto pendente, o botão "Validar meus
 * dados", que dispara a validação **simulada** (o texto diz isso). Validou,
 * o selo vira Confiável com um aviso de sucesso.
 *
 * Usage:
 *   import TrustSealCard from '@/pages/SellerAdmin/TrustSealCard';
 *   <TrustSealCard />
 */
function TrustSealCard() {
  const { toast } = useToast();
  const { state, validating, validate, retry } = useStoreVerification();

  async function handleValidate() {
    if (await validate()) {
      toast('Pronto! Sua loja agora tem o selo Confiável.', { kind: 'success' });
    } else {
      toast('Não foi possível validar seus dados agora. Tente de novo.', { kind: 'error' });
    }
  }

  if (state.status === 'ready' && state.verification === null) return null;

  return (
    <section
      aria-labelledby="selo-titulo"
      className="flex flex-col gap-3 border border-linha bg-branco-quente p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="selo-titulo" className="font-display text-h4 text-tinta">
          Selo Confiável
        </h2>
        {state.status === 'ready' && state.verification && (
          <VerifiedBadge state={state.verification} label="Confiável" />
        )}
      </div>

      {state.status === 'loading' && (
        <p role="status" className="font-ui text-body-sm text-texto-auxiliar">
          Consultando o selo da sua loja…
        </p>
      )}

      {state.status === 'error' && (
        <ErrorState message="Não foi possível consultar o selo da sua loja." onRetry={retry} />
      )}

      {state.status === 'ready' && state.verification === 'pendente' && (
        <>
          <p className="font-ui text-body-sm text-texto-auxiliar">
            Lojas com o selo passam mais confiança para quem compra. Nesta versão da Vintex a
            validação é simulada: nenhum documento é conferido de verdade.
          </p>
          <div>
            <Button onClick={() => void handleValidate()} disabled={validating}>
              {validating ? 'Validando…' : 'Validar meus dados'}
            </Button>
          </div>
        </>
      )}

      {state.status === 'ready' && state.verification === 'confiavel' && (
        <p className="font-ui text-body-sm text-texto-auxiliar">
          Sua loja exibe o selo Confiável no perfil e nas suas peças. (Validação simulada.)
        </p>
      )}
    </section>
  );
}

export default TrustSealCard;
