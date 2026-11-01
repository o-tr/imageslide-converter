import { createId } from "@/lib/createId";
import type { SlideConfig } from "./types";

export const createSignboardImage = (): SlideConfig => ({
  id: createId(),
  file: null,
  transition: "None",
});

export const createUniqueId = (): string => createId();
