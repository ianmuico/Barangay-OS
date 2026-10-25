/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // The project often lives on a slow external drive; the 60s default times out.
  staticPageGenerationTimeout: 300,
};

module.exports = nextConfig;
