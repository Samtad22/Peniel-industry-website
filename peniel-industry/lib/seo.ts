import type { Metadata } from "next";

/**
 * Builds an `openGraph.images` entry pointing at the dynamic /api/og
 * generator for a given page. Keeps each page's metadata export short.
 */
export function ogImage(title: string, eyebrow: string): Metadata["openGraph"] {
  const params = new URLSearchParams({ title, eyebrow });
  return {
    images: [{ url: `/api/og?${params.toString()}`, width: 1200, height: 630 }],
  };
}
