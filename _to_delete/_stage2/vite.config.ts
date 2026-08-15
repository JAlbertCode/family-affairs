import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is set at build time so the same source deploys to GitHub Pages
// (served from /<repo>/) or to any root-served host (Cloudflare/Vercel/Netlify).
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
  },
})
