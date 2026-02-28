import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', env.VITE_CLIENT_LOGO_URL],
        manifest: {
          name: env.VITE_PWA_NAME || 'Control de Asistencia',
          short_name: env.VITE_PWA_SHORT_NAME || 'Asistencia',
          description: 'Sistema de control de asistencia para empleados',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: env.VITE_CLIENT_LOGO_URL || 'logo.jpg',
              sizes: '192x192',
              type: env.VITE_CLIENT_LOGO_URL?.endsWith('.png') ? 'image/png' : 'image/jpeg'
            },
            {
              src: env.VITE_CLIENT_LOGO_URL || 'logo.jpg',
              sizes: '512x512',
              type: env.VITE_CLIENT_LOGO_URL?.endsWith('.png') ? 'image/png' : 'image/jpeg'
            }
          ]
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/worldtimeapi\.org\/api\/timezone\/Etc\/UTC/,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/reverse/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-locations-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 // 24 hours
                }
              }
            }
          ]
        }
      })
    ],
  }
})
