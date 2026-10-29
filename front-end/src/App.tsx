import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { ToastProvider } from '@/context/ToastContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import AppRoutes from '@/routes/AppRoutes';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* CartProvider e FavoritesProvider usam useAuth(): ficam dentro do AuthProvider. */}
        <NotificationsProvider>
          <CartProvider>
            <FavoritesProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </FavoritesProvider>
          </CartProvider>
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
