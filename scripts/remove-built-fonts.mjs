// Fonts are provided by the frontend's image volume, not copied into the app image.
import { rm } from "node:fs/promises";
await rm(new URL("../.output/public/deckcraft/fonts", import.meta.url), {
  recursive: true,
  force: true,
});
