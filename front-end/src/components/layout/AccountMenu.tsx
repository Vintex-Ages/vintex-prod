type AccountMenuProps = {
  authenticated: boolean;
  user?: { name: string };
  items?: { label: string; onSelect: () => void }[];
  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
};

/**
 * Menu de conta do header — apresentação em dois estados (anônimo / logado).
 * O pai passa authenticated, os itens e os callbacks.
 *
 * Usage:
 * import { AccountMenu } from '@/components/layout/AccountMenu';
 * <AccountMenu
 *   authenticated={logado}
 *   user={{ name }}
 *   items={[{ label: 'Favoritos', onSelect: abrirFavoritos }]}
 *   onLogin={abrirLogin}
 *   onRegister={abrirCadastro}
 *   onLogout={sair}
 * />
 */
export function AccountMenu({
  authenticated,
  user,
  items = [],
  onLogin,
  onRegister,
  onLogout,
}: AccountMenuProps) {
  return (
    <div className="w-full max-w-sm border border-linha bg-branco-quente p-6 web:max-w-md">
      {authenticated ? (
        <div>
          {user?.name && <p className="mb-4 font-ui text-body font-bold text-tinta">{user.name}</p>}

          <ul className="divide-y divide-linha">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={item.onSelect}
                  className="w-full py-4 text-left font-ui text-body text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tinta"
                >
                  {item.label}
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-4 text-left font-ui text-body text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tinta"
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
              className="w-full border border-linha bg-branco-quente px-4 py-3 font-ui text-body font-bold text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
            >
              Entrar
            </button>

            <button
              type="button"
              onClick={onRegister}
              className="w-full bg-verde-rs px-4 py-3 font-ui text-body font-bold text-branco-quente transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente"
            >
              Criar conta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
