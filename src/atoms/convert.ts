import { RESOLUTION_OPTIONS, type Resolution } from "@/const/resolutions";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const TargetResolutionAtom = atomWithStorage<Resolution>(
  "target-resolution",
  "FHD",
  {
    getItem: (key, initialValue) => {
      if (typeof window === "undefined") return initialValue;
      const storedValue = localStorage.getItem(key);
      if (!storedValue) return initialValue;

      try {
        const parsed = JSON.parse(storedValue);
        // 有効な解像度オプションかチェック
        if (RESOLUTION_OPTIONS.includes(parsed)) {
          return parsed as Resolution;
        }
      } catch {
        // パースエラー時はデフォルト値を返す
      }

      return initialValue;
    },
    setItem: (key, value) => {
      if (typeof window === "undefined") return;
      localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key) => {
      if (typeof window === "undefined") return;
      localStorage.removeItem(key);
    },
  },
);

export const ResultAtom = atom<{
  data: Buffer;
  format: string;
  version: number;
}>();
