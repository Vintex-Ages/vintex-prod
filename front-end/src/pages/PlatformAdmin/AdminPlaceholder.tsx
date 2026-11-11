import { AdminHeader } from '@/components/admin/AdminHeader';

interface AdminPlaceholderProps {
  title: string;
}

export default function AdminPlaceholder({ title }: AdminPlaceholderProps) {
  return (
    <div className="min-h-screen bg-branco-quente tablet:bg-papel">
      <AdminHeader />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 pb-12 pt-6 tablet:gap-10 tablet:px-10 tablet:pb-24 tablet:pt-14 web:px-20">
        <div className="flex flex-col gap-1.5 tablet:gap-2.5">
          <h1 className="font-display text-h2 tracking-tight text-tinta">{title}</h1>
          <p className="font-ui text-body-sm text-texto-auxiliar">
            Essa tela ainda não foi implementada.
          </p>
        </div>
      </main>
    </div>
  );
}
