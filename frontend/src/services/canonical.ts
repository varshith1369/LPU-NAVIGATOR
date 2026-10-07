const productionOrigin = "https://lpu-campus-navigator-beryl.vercel.app";

// Deployment aliases must share the API's configured origin and session cookies.
export function canonicalDestination(href: string): string | null {
  const url = new URL(href);
  const hosted = url.hostname.endsWith(".vercel.app") || url.hostname === "lpu-campus-api.onrender.com";
  if (!hosted || url.origin === productionOrigin) return null;
  return productionOrigin + url.pathname + url.search + url.hash;
}
