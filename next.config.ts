import type { NextConfig } from "next";

const config: NextConfig = {
  ...(process.env.EPI_UX_PREVIEW === "true" && { distDir: ".next-ux-preview" }),
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/ca-catalogo": ["./data/ca-catalogo.json.gz"] },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default config;
