/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const writeVersionPlugin = () => ({
    name: 'write-version',
    buildStart() {
      fs.writeFileSync('public/version.json', JSON.stringify({ version: env.VITE_APP_VERSION || '1.0.0' }));
    }
  });

  return {
    plugins: [
      react(),
      writeVersionPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [env.VITE_CLIENT_LOGO_URL, 'logo.jpg'],
        manifest: {
          name: env.VITE_PWA_NAME || 'Control de Asistencia',
          short_name: env.VITE_PWA_SHORT_NAME || 'FaceControl',
          description: 'Sistema de control de asistencia para empleados',
          theme_color: '#3C7DA6',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: env.VITE_CLIENT_LOGO_URL || 'logo.jpg',
              sizes: '192x192',
              type: env.VITE_CLIENT_LOGO_URL?.endsWith('.png') ? 'image/png' : 'image/jpeg',
              purpose: 'any maskable'
            },
            {
              src: env.VITE_CLIENT_LOGO_URL || 'logo.jpg',
              sizes: '512x512',
              type: env.VITE_CLIENT_LOGO_URL?.endsWith('.png') ? 'image/png' : 'image/jpeg',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/worldtimeapi\.org\/api\/timezone\/Etc\/UTC/,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /^https:\/\/www\.timeapi\.io\/api\/Time\/current\/zone/,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /^https:\/\/firebasestorage\.googleapis\.com/,
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
