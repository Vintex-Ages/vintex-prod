import HomePanel from '@/components/home/HomePanel';
import { usePendingReceipts } from '@/hooks/usePendingReceipts';
import { paths } from '@/routes/paths';

function situation(pending: number): string {
  if (pending === 0) return 'Nenhum comprovante esperando análise.';
  return pending === 1
    ? '1 comprovante esperando análise.'
    : `${pending} comprovantes esperando análise.`;
}

/**
 * Administração na Home: comprovantes pendentes e atalhos das telas da área
 * admin.
 *
 * Usage:
 *   {user.is_admin ? <AdminHomePanel /> : null}
 */
function AdminHomePanel() {
  const pending = usePendingReceipts();

  return (
    <HomePanel
      title="Administração da Vintex"
      message={pending === null ? null : situation(pending)}
      primary={{ label: 'Comprovantes', to: paths.adminReceipts }}
      links={[
        { label: 'Indicadores', to: paths.adminDashboard },
        { label: 'Moderação', to: paths.adminModeration },
        { label: 'Reclamações', to: paths.adminReports },
      ]}
    />
  );
}

export default AdminHomePanel;
