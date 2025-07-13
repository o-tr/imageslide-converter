import type { SlideConfig } from "./types";

export const createSignboardImage = (): SlideConfig => ({
  id: crypto.randomUUID(),
  file: null,
  transition: "None",
});

export const createUniqueId = (): string => crypto.randomUUID();
