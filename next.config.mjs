/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth", "playwright-core", "@prisma/client"],
};

export default nextConfig;
