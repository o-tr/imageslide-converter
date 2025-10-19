/**
 * 解像度の型定義
 */
export type Resolution = "4K" | "FHD" | "HD" | "SD";

/**
 * 解像度オプションの配列
 */
export const RESOLUTION_OPTIONS = ["4K", "FHD", "HD", "SD"] as const;

/**
 * 解像度ごとの詳細情報
 */
export const RESOLUTION_DIMENSIONS = {
  "4K": {
    width: 3840,
    height: 2160,
    label: "4K",
    description: "3840×2160 (高解像度のまま)",
  },
  FHD: {
    width: 1920,
    height: 1080,
    label: "FHD",
    description: "1920×1080",
  },
  HD: {
    width: 1280,
    height: 720,
    label: "HD",
    description: "1280×720",
  },
  SD: {
    width: 640,
    height: 480,
    label: "SD",
    description: "640×480",
  },
} as const satisfies Record<
  Resolution,
  {
    width: number;
    height: number;
    label: string;
    description: string;
  }
>;
