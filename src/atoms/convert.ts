import { TargetFormats, TargetVersions } from "@/const/convert";
import { RESOLUTION_OPTIONS, type Resolution } from "@/const/resolutions";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const VALID_VERSIONS = TargetVersions.map((v) => v.label);

export const UsingVersionAtom = atomWithStorage<string>(
  "using-version",
  "v0.3.x",
  {
    getItem: (key, initialValue) => {
      if (typeof window === "undefined") return initialValue;
      const storedValue = localStorage.getItem(key);
      if (!storedValue) return initialValue;

      try {
        const parsed = JSON.parse(storedValue);
        if (typeof parsed === "string" && VALID_VERSIONS.includes(parsed)) {
          return parsed;
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

const VALID_FORMATS = [
  "auto",
  "auto-one-file",
  ...TargetFormats.map((f) => f.id),
];

export const ConvertFormatAtom = atomWithStorage<string>(
  "convert-format",
  "auto",
  {
    getItem: (key, initialValue) => {
      if (typeof window === "undefined") return initialValue;
      const storedValue = localStorage.getItem(key);
      if (!storedValue) return initialValue;

      try {
        const parsed = JSON.parse(storedValue);
        if (typeof parsed === "string" && VALID_FORMATS.includes(parsed)) {
          return parsed;
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
  data: string[] | Buffer[];
  format: string;
  version: number;
}>();
