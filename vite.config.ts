import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the app from /<repo>/, so the bundle needs a base path.
// Local dev and `vite preview` stay at '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE_PATH ?? '/WeGo/') : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
