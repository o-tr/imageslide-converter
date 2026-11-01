import {
  useRouterState,
  useRouter as useTanStackRouter,
} from "@tanstack/react-router";
import { useMemo } from "react";

export function useRouter() {
  const router = useTanStackRouter();
  return useMemo(
    () => ({
      push: (href: string) =>
        router.history.push(
          new URL(href, window.location.href).pathname +
            new URL(href, window.location.href).search,
        ),
      replace: (href: string) =>
        router.history.replace(
          new URL(href, window.location.href).pathname +
            new URL(href, window.location.href).search,
        ),
      refresh: () => router.invalidate(),
      back: () => router.history.back(),
    }),
    [router],
  );
}
export function usePathname() {
  return useRouterState({ select: (state) => state.location.pathname });
}
export function useSearchParams() {
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  return useMemo(() => new URLSearchParams(search), [search]);
}
