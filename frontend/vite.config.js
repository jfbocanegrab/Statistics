import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo, /api se envía al backend Flask local (python wsgi.py)
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
