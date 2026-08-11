import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 4173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(moduleId) {
          if (!moduleId.includes('node_modules')) return undefined
          if (moduleId.includes('lucide-react')) return 'icons'
          if (moduleId.includes('@supabase')) return 'supabase'
          if (moduleId.includes('/react/') || moduleId.includes('/react-dom/') || moduleId.includes('/scheduler/')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
