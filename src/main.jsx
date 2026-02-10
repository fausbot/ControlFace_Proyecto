import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register'

// Registro automático del Service Worker con recarga silenciosa
registerSW({
  onNeedUpdate() {
    console.log('Nueva versión detectada. Actualizando automáticamente...');
    window.location.reload();
  },
  onOfflineReady() {
    console.log('App lista para uso offline');
  },
})

// --- CONTROL DE VERSIÓN FORZADO ---
// Cambiar este número cuando se necesite forzar a TODOS los usuarios a recargar
const APP_VERSION = '1.0.5';
const savedVersion = localStorage.getItem('app_version');

if (savedVersion !== APP_VERSION) {
  console.log(`Nueva versión detectada (${APP_VERSION}). Limpiando caché...`);
  localStorage.setItem('app_version', APP_VERSION);

  // Limpiar Service Workers y Caché manualmente como medida extrema
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }

  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name);
    }
  });

  // Forzar recarga desde el servidor (no caché)
  window.location.reload();
}
// ----------------------------------

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
