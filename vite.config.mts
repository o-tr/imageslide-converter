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
          server.middlewares.use(
            "/deckcraft-fonts",
            sirv(directory, { dev: true }),
          );
        },
      },
      tanstackStart(),
      nitro(),
      react(),
      tailwindcss(),
    ],
  };
});
