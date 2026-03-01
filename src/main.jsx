import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register'

// Registro automático del Service Worker con recarga silenciosa
// Registro automático del Service Worker con recarga silenciosa
registerSW({
  immediate: true, // Registrar inmediatamente
  onNeedUpdate() {
    console.log('[PWA] Nueva versión detectada. Aplicando cambios...');
    // No recargar aquí directamente, dejar que la lógica de APP_VERSION y Login lo maneje
    // o forzar si no estamos en Login
    if (!window.location.pathname.includes('login')) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.log('[PWA] App lista para uso offline');
  },
})

// --- CONTROL DE VERSIÓN FORZADO ---
// Cambiar este número cuando se necesite forzar a TODOS los usuarios a recargar
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.3.16';
const savedVersion = localStorage.getItem('app_version');

if (savedVersion !== APP_VERSION && !sessionStorage.getItem('reloaded_for_version')) {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOS = userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod');

  console.log(`[Version] Nueva versión detectada (${APP_VERSION}). Dispositivo: ${isIOS ? 'iOS' : 'Standard'}`);
  localStorage.setItem('app_version', APP_VERSION);
  sessionStorage.setItem('reloaded_for_version', 'true');

  if (isIOS) {
    // LIMPIEZA PROFUNDA PARA IOS (Sticky Cache)
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
    // Forzar recarga completa desde servidor
    window.location.reload(true);
  } else {
    // LIMPIEZA ESTÁNDAR PARA ANDROID/PC
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    }
    window.location.reload();
  }
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
