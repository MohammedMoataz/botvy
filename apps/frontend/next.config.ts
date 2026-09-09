import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

// The Docker image copies .next/standalone; see apps/frontend/Dockerfile.
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
};

export default createNextIntlPlugin('./i18n/request.ts')(nextConfig);
