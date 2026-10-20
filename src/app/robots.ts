import type { MetadataRoute } from "next";

// Belt-and-suspenders: the root-layout `metadata.robots = noindex` already
// tells well-behaved crawlers to stay out. This `/robots.txt` denies any
// crawler that ignores meta tags but honors robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
