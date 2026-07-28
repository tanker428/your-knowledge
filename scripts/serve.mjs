/**
 * Local static server for development.
 *
 * Serves the repository under a sub-path by default, because that is what
 * GitHub Pages does for a project site — testing at `/` hides exactly the class
 * of bug this port had to avoid.
 *
 *   npm run dev                      → http://localhost:8000/your-knowledge/
 *   npm run dev -- --base=/ --port=3000
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

const port = Number(args.get("port") || 8000);
const dir = args.get("dist") !== undefined ? path.join(root, "dist") : root;
let base = args.get("base") ?? "/your-knowledge/";
if (!base.startsWith("/")) base = `/${base}`;
if (!base.endsWith("/")) base = `${base}/`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${port}`);

  if (base !== "/" && !url.pathname.startsWith(base)) {
    response.writeHead(302, { Location: base });
    response.end();
    return;
  }

  let relative = decodeURIComponent(
    url.pathname.slice(base.length - 1),
  ).replace(/^\/+/, "");
  if (relative === "") relative = "index.html";

  const target = path.join(dir, relative);
  // Never serve outside the served directory.
  if (!target.startsWith(dir)) {
    response.writeHead(403).end("forbidden");
    return;
  }

  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    response
      .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      .end("404");
    return;
  }

  response.writeHead(200, {
    "Content-Type":
      MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(target).pipe(response);
});

server.listen(port, () => {
  console.log(
    `serving ${path.relative(root, dir) || "."} at http://localhost:${port}${base}`,
  );
});
