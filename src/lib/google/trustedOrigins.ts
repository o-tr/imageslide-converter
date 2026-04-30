export const TRUSTED_HOSTNAMES = [
  ".google.com",
  ".googleapis.com",
  ".googleusercontent.com",
] as const;

export const isTrustedOrigin = (url: string): boolean => {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    return TRUSTED_HOSTNAMES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
};
