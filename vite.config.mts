import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import sirv from "sirv";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "")))
    process.env[key] ??= value;
  return {
    resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
    plugins: [
      {
        name: "local-font-volume",
        configureServer(server) {
          const directory =
            process.env.DECKCRAFT_FONT_DIR ||
            path.resolve(process.cwd(), "public/deckcraft/fonts");
          const serve = sirv(directory, { dev: true });
          server.middlewares.use("/deckcraft-fonts", (req, res, next) => {
            // sirv does not percent-decode paths, so font files such as
            // `Inter[opsz,wght].ttf` (requested as `Inter%5Bopsz%2Cwght%5D.ttf`)
            // would 404. nginx decodes them in production.
            try {
              const url = req.url ?? "/";
              const q = url.indexOf("?");
              const pathname = q === -1 ? url : url.slice(0, q);
              const decoded = decodeURIComponent(pathname);
              if (decoded.split(/[\\/]/).includes("..")) {
                res.statusCode = 400;
                res.end();
                return;
              }
              req.url = decoded + (q === -1 ? "" : url.slice(q));
            } catch {
              res.statusCode = 400;
              res.end();
              return;
            }
            serve(req, res, next);
          });
        },
      },
      tanstackStart(),
      nitro(),
      react(),
      tailwindcss(),
    ],
  };
});
