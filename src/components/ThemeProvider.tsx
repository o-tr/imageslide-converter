import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";
const STORAGE_KEY = "imageslide-theme";
const ThemeContext = createContext<{
  theme: Theme;
  resolvedTheme?: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}>({ theme: "system", setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeValue] = useState<Theme>("system");
  const [ready, setReady] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>();
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system")
        setThemeValue(saved);
    } catch {
      /* Storage may be unavailable; keep following the system. */
    }
    setReady(true);
    const storage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setThemeValue(
        event.newValue === "light" || event.newValue === "dark"
          ? event.newValue
          : "system",
      );
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(resolved);
      document.documentElement.style.colorScheme = resolved;
      setResolvedTheme(resolved);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [ready, theme]);
  const setTheme = useCallback((value: Theme) => {
    setThemeValue(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* Keep the choice for this page. */
    }
  }, []);
  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);

// Runs before the page paints to avoid a flash of the wrong system theme.
export const themeBootstrap = `try{var t=localStorage.getItem('imageslide-theme');var d=t==='dark'||((t!=='light')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}`;
