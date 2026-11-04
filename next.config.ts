import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portals read as paths; the dashboard works out the portal from the address.
  async rewrites() {
    return [
      { source: "/nontech", destination: "/?portal=nontech" },
      { source: "/internships", destination: "/?portal=internships" },
    ];
  },
  // Logos are already small, and optimizing them would be one more metered function.
  images: { unoptimized: true },
};

export default nextConfig;
