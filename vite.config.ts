import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/FMFID-APP/',
})

VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'FMFID APP',
    short_name: 'FMFID',
    description: 'Gestión de mesa de rol',
    theme_color: '#1b1b1f',
    background_color: '#1b1b1f',
    display: 'standalone',
    start_url: '/FMFID-APP/',
    scope: '/FMFID-APP/',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
})
