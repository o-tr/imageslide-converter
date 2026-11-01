// Public values are injected by the server at request time so one container image
// can be configured differently without rebuilding client bundles.
declare global {
  interface Window {
    __IMAGE_SLIDE_CONFIG__?: Record<string, string>;
  }
}
const serverEnv = typeof process === "undefined" ? {} : process.env;
const publicEnv =
  typeof window === "undefined"
    ? serverEnv
    : (window.__IMAGE_SLIDE_CONFIG__ ?? {});

export const S3_NORMAL_PUBLIC_BASE_URL =
  publicEnv.NEXT_PUBLIC_S3_NORMAL_PUBLIC_BASE_URL ?? "";
export const S3_HA_PUBLIC_BASE_URL =
  publicEnv.NEXT_PUBLIC_S3_HA_PUBLIC_BASE_URL ?? "";
export const GOOGLE_API_KEY = publicEnv.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
export const GOOGLE_CLIENT_ID = publicEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const GIF_ANIMATION_ENABLED =
  publicEnv.NEXT_PUBLIC_ENABLE_GIF_ANIMATION !== "false";

export const S3_NORMAL_ACCESS_KEY = serverEnv.S3_NORMAL_ACCESS_KEY ?? "";
export const S3_NORMAL_SECRET_KEY = serverEnv.S3_NORMAL_SECRET_KEY ?? "";
export const S3_NORMAL_ENDPOINT = serverEnv.S3_NORMAL_ENDPOINT ?? "";
export const S3_NORMAL_BUCKET = serverEnv.S3_NORMAL_BUCKET ?? "";
export const S3_HA_ACCESS_KEY = serverEnv.S3_HA_ACCESS_KEY ?? "";
export const S3_HA_SECRET_KEY = serverEnv.S3_HA_SECRET_KEY ?? "";
export const S3_HA_ENDPOINT = serverEnv.S3_HA_ENDPOINT ?? "";
export const S3_HA_BUCKET = serverEnv.S3_HA_BUCKET ?? "";
export const DISCORD_CLIENT_ID = serverEnv.DISCORD_CLIENT_ID ?? "";
export const DISCORD_CLIENT_SECRET = serverEnv.DISCORD_CLIENT_SECRET ?? "";
export const IRON_SESSION_PASSWORD = serverEnv.IRON_SESSION_PASSWORD ?? "";
export const IRON_SESSION_COOKIE_NAME =
  serverEnv.IRON_SESSION_COOKIE_NAME ?? "";
