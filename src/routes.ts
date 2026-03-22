export const restrictedRoutes = ["/my/"];
// Note: /auth/popup/callback is intentionally NOT listed here — it must remain
// accessible to the now-authenticated user after the OAuth redirect completes.
export const authRoutes = ["/login", "/register", "/auth/popup"];
export const DEFAULT_LOGIN_REDIRECT = "/";
