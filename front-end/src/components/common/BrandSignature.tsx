import aiSearchIcon from '@/assets/images/ai-search.svg';
import aiSearchSparkle from '@/assets/images/ai-search-sparkle.svg';

interface BrandSignatureProps {
  headingAs?: 'h1' | 'p';
}

function BrandSignature({ headingAs: Heading = 'h1' }: BrandSignatureProps) {
  return (
    <>
      <section className="border-b-[0.8px] border-vermelho-escuro bg-vermelho-escuro px-4 py-[17.6px]">
        <Heading className="text-center font-display text-[27.3px] leading-[28.64px] text-branco-quente">
          {'Recicle roupas,\u00a0'}
          <span className="relative mx-1 whitespace-nowrap px-1.5 before:absolute before:inset-[-5px_-6px] before:-rotate-4 before:rounded-[32px] before:border before:border-branco-quente after:absolute after:inset-[-5px_-8px] after:rotate-[2deg] after:rounded-[34px] after:border after:border-branco-quente after:opacity-65">
            não ex.
          </span>
        </Heading>
      </section>
      <div className="relative flex items-center justify-center gap-1 border border-verde-rs/30 bg-[#e7efe9] px-4 py-2 text-[10px] font-bold uppercase leading-none text-verde-rs">
        <span className="relative h-4 w-4 shrink-0">
          <img src={aiSearchIcon} alt="" className="absolute left-0 top-0" />
          <img src={aiSearchSparkle} alt="" className="absolute left-[9.13px] top-[9px]" />
        </span>
        <span>Busca com inteligência artificial</span>
      </div>
    </>
  );
}

export default BrandSignature;
