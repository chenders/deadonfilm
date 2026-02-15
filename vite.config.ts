import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: isSsrBuild ? 'dist/server' : 'dist/client',
    ssrManifest: !isSsrBuild,
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom', 'react-router-dom'],
              query: ['@tanstack/react-query'],
            },
          },
        },
  },
  ssr: {
    // Packages that should be bundled (not externalized) for SSR.
    // Most deps are fine as externals; add here if they ship ESM-only
    // or have CSS side-effects that Vite needs to process.
    noExternal: ['react-helmet-async'],
  },
  server: {
    port: 5173,
    host: true, // Listen on all interfaces (needed for Docker)
    hmr: {
      // Support both native and Docker development
      host: process.env.VITE_HMR_HOST || 'localhost',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/admin/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/nr-browser.js': {
        target: process.env.VITE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
}))
