import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Session = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
} | null;
type SessionState = {
  data: Session;
  status: "loading" | "authenticated" | "unauthenticated";
  update: () => Promise<void>;
};
const Context = createContext<SessionState>({
  data: null,
  status: "loading",
  update: async () => {},
});
export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const update = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session");
      const session = response.ok ? await response.json() : null;
      setData(session?.user ? session : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void update();
  }, [update]);
  return (
    <Context.Provider
      value={{
        data,
        status: loading
          ? "loading"
          : data
            ? "authenticated"
            : "unauthenticated",
        update,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
async function authAction(action: string, callbackUrl: string) {
  const csrf = await fetch("/api/auth/csrf").then((res) => res.json());
  if (!csrf.csrfToken) throw new Error("Could not obtain CSRF token");
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl }),
  });
  const data = await response.json();
  if (!response.ok || !data.url)
    throw new Error("Authentication request failed");
  window.location.assign(data.url);
}
export const signIn = (_provider: string, options?: { callbackUrl?: string }) =>
  authAction("signin/discord", options?.callbackUrl ?? window.location.href);
export const signOut = () => authAction("signout", window.location.origin);
