import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const UsingVersionAtom = atomWithStorage<string>("using-version", "");
export const ConvertFormatAtom = atomWithStorage<string>(
  "convert-format",
  "auto",
);
export const TargetResolutionAtom = atomWithStorage<"4K" | "FHD" | "HD" | "SD">(
  "target-resolution",
  "FHD",
);

export const ResultAtom = atom<{
  data: string[] | Buffer[];
  format: string;
  version: number;
}>();
