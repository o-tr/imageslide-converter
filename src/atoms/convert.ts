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
  {
    getItem: (key, initialValue) => {
      const storedValue = localStorage.getItem(key);
      if (!storedValue) return initialValue;

      try {
        const parsed = JSON.parse(storedValue);
        // 有効な解像度オプションかチェック
        if (["4K", "FHD", "HD", "SD"].includes(parsed)) {
          return parsed as "4K" | "FHD" | "HD" | "SD";
        }
      } catch {
        // パースエラー時はデフォルト値を返す
      }

      return initialValue;
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
  },
);

export const ResultAtom = atom<{
  data: string[] | Buffer[];
  format: string;
  version: number;
}>();
