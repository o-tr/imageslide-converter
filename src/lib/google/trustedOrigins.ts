export const TRUSTED_HOSTNAMES = [
  ".google.com",
  ".googleapis.com",
  ".googleusercontent.com",
];

export const isTrustedOrigin = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return TRUSTED_HOSTNAMES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
};
