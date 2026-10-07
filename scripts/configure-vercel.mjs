import { writeFileSync } from "node:fs";
const raw = process.argv[2];
if (!raw)
  throw new Error(
    "Usage: node scripts/configure-vercel.mjs https://your-actual-backend-host",
  );
const backend = new URL(raw);
if (
  backend.protocol !== "https:" ||
  backend.username ||
  backend.password ||
  backend.pathname !== "/" ||
  backend.search ||
  backend.hash
)
  throw new Error("Use an HTTPS backend origin without a path or credentials.");
writeFileSync(
  "vercel.json",
  JSON.stringify(
    {
      buildCommand: "npm run build",
      outputDirectory: "dist",
      rewrites: [
        { source: "/api/:path*", destination: `${backend.origin}/api/:path*` },
        { source: "/:path*", destination: "/index.html" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Wrote vercel.json for the supplied backend. Configure APP_ORIGIN on the API to the frontend HTTPS origin.",
);
