import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["circle.com", "images.deepbook.tech"],
    dangerouslyAllowSVG: true
  }
};

export default nextConfig;
