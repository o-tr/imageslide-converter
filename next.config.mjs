/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins:
    process.env.DEV_ALLOWED_ORIGINS?.split(",").filter(Boolean) ?? [],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        port: "",
        pathname: "/avatars/**",
      },
    ],
  },
};

export default nextConfig;
