import React, { Suspense, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Loader2, Lock } from 'lucide-react';
import SubscriptionGuard from './components/SubscriptionGuard';

// Lazy loading de páginas
const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Datos = React.lazy(() => import('./pages/Datos'));
const Register = React.lazy(() => import('./pages/Register'));
const ChangeAdminPassword = React.lazy(() => import('./pages/ChangeAdminPassword'));
const Configuracion = React.lazy(() => import('./pages/Configuracion'));
const Informes = React.lazy(() => import('./pages/Informes'));

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
}

// Componente de carga simple
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-3">
      <Loader2 size={48} className="text-blue-600 animate-spin" />
      <p className="text-gray-500 font-medium">Cargando aplicación...</p>
    </div>
  </div>
);

const GlobalGateway = ({ children }) => {
  const { currentUser } = useAuth();
  const [pinEntered, setPinEntered] = useState(() => sessionStorage.getItem('global_pin_unlocked') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const REQUIRED_PIN = import.meta.env.VITE_GLOBAL_ACCESS_PIN;

  if (!REQUIRED_PIN || currentUser || pinEntered) {
    return children;
  }

  const handleUnlock = (e) => {
    e.preventDefault();
    if (pinInput === REQUIRED_PIN) {
      sessionStorage.setItem('global_pin_unlocked', 'true');
      setPinEntered(true);
    } else {
      setError('PIN de acceso incorrecto');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-white/20">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center shadow-inner">
            <Lock className="text-blue-400 w-8 h-8" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-white mb-2 tracking-wide">Acceso Restringido</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Sistema de uso privado. Introduce la clave de acceso maestro.</p>

        <form onSubmit={handleUnlock}>
          <input
            type="password"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none mb-4 text-center text-xl tracking-[0.3em] text-white placeholder-gray-500 transition-all font-mono"
            placeholder="••••••••"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs text-center mb-4 font-medium">{error}</p>}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/50">
            Desbloquear Sistema
          </button>
        </form>
      </div>
    </div>
  );
};

function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <GlobalGateway>
        <SubscriptionGuard>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Register />} />
            <Route path="/dashboard" element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } />
            <Route path="/datos" element={<Datos />} />
            <Route path="/informes" element={<Informes />} />
            <Route path="/cambiar-clave-admin" element={<ChangeAdminPassword />} />
            <Route path="/configuracion" element={<Configuracion />} />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
        </SubscriptionGuard>
      </GlobalGateway>
    </Suspense>
  );
}

export default App;
