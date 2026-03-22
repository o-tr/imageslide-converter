import { TargetVersions } from "@/const/convert";
import { RESOLUTION_OPTIONS, type Resolution } from "@/const/resolutions";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

const VALID_VERSIONS = [...TargetVersions.map((v) => v.label), "all"];

export const UsingVersionAtom = atomWithStorage<string>(
  "using-version",
  "v0.3.x",
  {
    getItem: (key, initialValue) => {
      const storedValue = localStorage.getItem(key);
      if (!storedValue) return initialValue;

      try {
        const parsed = JSON.parse(storedValue);
        if (VALID_VERSIONS.includes(parsed)) {
          return parsed as string;
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
export const ConvertFormatAtom = atomWithStorage<string>(
  "convert-format",
  "auto",
);
export const TargetResolutionAtom = atomWithStorage<Resolution>(
  "target-resolution",
  "FHD",
  {
    getItem: (key, initialValue) => {
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
