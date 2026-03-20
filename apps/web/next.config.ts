import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@agentsy/ui', '@agentsy/shared'],
};

export default nextConfig;
