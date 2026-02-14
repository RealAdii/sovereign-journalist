/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Polyfill fallbacks for Reclaim SDK (uses Node.js crypto/buffer)
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        buffer: false,
        stream: false,
        util: false,
        http: false,
        https: false,
        url: false,
        zlib: false,
        net: false,
        tls: false,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
