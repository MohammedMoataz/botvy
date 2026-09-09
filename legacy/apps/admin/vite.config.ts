import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/admin/' — the gateway serves this SPA at /admin (constitution Principle V).
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: { port: 5174 },
});
