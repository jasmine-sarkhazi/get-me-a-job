/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "playwright-core", "@prisma/client"],
  },
};

export default nextConfig;
