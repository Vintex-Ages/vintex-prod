/**
 * Cartão de um número do painel geral da administradora (FE-US033-1, #413),
 * no estilo do "KPI Stat Card" do Figma (Financeiro e GMV, 554:32): rótulo em
 * caixa alta e o número em destaque. `tone="success"` pinta o número de verde,
 * como o tom Success do Figma (dinheiro retido). Só apresentação: o valor já
 * chega formatado.
 *
 * Vai dentro de um `<dl>`: o rótulo é o `dt` e o valor, o `dd`.
 *
 * Usage:
 *   <dl className="grid gap-3">
 *     <DashboardStatCard label="Lojas na plataforma" value="7" />
 *   </dl>
 */
export function DashboardStatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 border border-linha bg-branco-quente p-6">
      <dt className="font-ui text-label font-bold uppercase text-texto-auxiliar">{label}</dt>
      <dd
        className={`break-words font-display text-h3 tracking-tight ${
          tone === 'success' ? 'text-verde-rs' : 'text-tinta'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
