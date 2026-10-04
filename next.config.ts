import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portals read as paths; the page still takes the portal from the query.
  async rewrites() {
    return [
      { source: "/nontech", destination: "/?portal=nontech" },
      { source: "/internships", destination: "/?portal=internships" },
    ];
  },
  images: {
    /**
     * Every image this site renders is a company logo in a 32-56px box, so the
     * stock ladder (imageSizes up to 384, deviceSizes up to 3840) only ever
     * produced srcset entries no browser here would pick. Trimmed to the sizes
     * a logo can actually use at 1x/2x/3x; deviceSizes still has to stay above
     * the largest imageSize, and only applies to images without a `sizes` prop.
     */
    imageSizes: [32, 48, 64, 96, 128],
    deviceSizes: [256, 640, 1080],
  },
};

export default nextConfig;
