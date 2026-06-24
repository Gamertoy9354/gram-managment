import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Render/Docker deployments
  output: 'standalone',

  // Expose the backend URL at build time (Render auto-sets NEXT_PUBLIC_API_URL)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },

  // Allow images from Supabase storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
