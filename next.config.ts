import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite loads its WASM and data files from its package directory at runtime,
  // so it must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite'],

  async headers() {
    return [
      {
        // The loader: short cache so sites pick up new collector versions quickly.
        source: '/v1.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        // The collector: content-hashed filename, so it can be cached forever.
        source: '/v1-core.:hash.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default nextConfig;
