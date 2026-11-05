import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project Pages lives at /<repo>/. Leave this unset for local dev (`/`).
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  }
})
