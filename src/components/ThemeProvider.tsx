"use client";
import { ConfigProvider, theme } from "antd";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type FC, type ReactNode, useEffect, useState } from "react";

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme="system"
    storageKey="imageslide-theme"
    enableSystem
    disableTransitionOnChange
  >
    <ThemedComponents>{children}</ThemedComponents>
  </NextThemesProvider>
);

const ThemedComponents: FC<{ children: ReactNode }> = ({ children }) => {
  const { resolvedTheme } = useTheme();
  // Match the server's initial Ant Design styles during hydration, then apply
  // the resolved browser preference so React updates all component styles.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <ConfigProvider
      theme={{
        algorithm:
          mounted && resolvedTheme === "dark"
            ? theme.darkAlgorithm
            : theme.defaultAlgorithm,
      }}
    >
      {children}
    </ConfigProvider>
  );
};
