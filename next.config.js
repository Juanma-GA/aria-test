/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/Customizations/Aria',
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['mongoose', 'bcryptjs'],
  // Turbopack disabled for production compatibility
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    return config;
  },
};

module.exports = nextConfig;
