type AccountMenuProps = {
  authenticated: boolean;
  user?: { name: string };
  items?: { label: string; onSelect: () => void }[];
  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
  platform?: 'mobile' | 'web';
};

export function AccountMenu({
  authenticated,
  user,
  items = [],
  onLogin,
  onRegister,
  onLogout,
  platform = 'web',
}: AccountMenuProps) {
  const containerClass = platform === 'mobile' ? 'w-full max-w-sm' : 'w-full max-w-md';

  return (
    <div className={`${containerClass} border border-linha bg-branco-quente p-6`}>
      {authenticated ? (
        <div>
          {user?.name && <p className="mb-4 font-ui text-body font-bold text-tinta">{user.name}</p>}

          <ul className="divide-y divide-linha">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={item.onSelect}
                  className="w-full py-4 text-left font-ui text-body text-tinta"
                >
                  {item.label}
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-4 text-left font-ui text-body text-tinta"
              >
                Sair
              </button>
            </li>
          </ul>
        </div>
      ) : (
        <div>
          <p className="font-ui text-body text-tinta">
            Entre para favoritar peças e acompanhar pedidos, ou cadastre-se para começar a garimpar.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={onLogin}
              className="w-full border border-linha bg-branco-quente px-4 py-3 font-ui text-body font-bold text-tinta"
            >
              Entrar
            </button>

            <button
              type="button"
              onClick={onRegister}
              className="w-full bg-verde-rs px-4 py-3 font-ui text-body font-bold text-branco-quente"
            >
              Criar conta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
