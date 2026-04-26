import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import SubscriptionGuard from './components/SubscriptionGuard';

// Lazy loading de páginas
const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Datos = React.lazy(() => import('./pages/Datos'));
const Register = React.lazy(() => import('./pages/Register'));
const ChangeAdminPassword = React.lazy(() => import('./pages/ChangeAdminPassword'));
const Configuracion = React.lazy(() => import('./pages/Configuracion'));
const Informes = React.lazy(() => import('./pages/Informes'));
const RutaDashboard = React.lazy(() => import('./pages/RutaDashboard'));
const Privacidad = React.lazy(() => import('./pages/Privacidad'));
import SyncManager from './components/dashboard/SyncManager';

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

function App() {
  const { currentUser } = useAuth();
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubscriptionGuard>
        <Routes>
          <Route path="/login" element={currentUser ? <Navigate to="/dashboard" /> : <Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
          <Route path="/ruta" element={
            <PrivateRoute>
              <RutaDashboard />
            </PrivateRoute>
          } />
          <Route path="/datos" element={<Datos />} />
          <Route path="/informes" element={<Informes />} />
          <Route path="/cambiar-clave-admin" element={<ChangeAdminPassword />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="/" element={<Navigate to={currentUser ? "/dashboard" : "/login"} />} />
        </Routes>
        <SyncManager />
      </SubscriptionGuard>
    </Suspense>
  );
}

export default App;
