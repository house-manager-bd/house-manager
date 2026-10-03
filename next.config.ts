import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Avatars and listing photos are compressed in the browser and served
    // straight from Supabase Storage, so Next.js image optimization stays off
    // (Vercel Hobby has a monthly optimization quota).
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
