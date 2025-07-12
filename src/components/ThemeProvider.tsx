"use client";
import { ThemeIsDarkAtom } from "@/atoms/theme";
import { ConfigProvider, theme } from "antd";
import { useAtomValue } from "jotai";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type FC, type ReactNode, useEffect } from "react";

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const isDarkMode = useAtomValue(ThemeIsDarkAtom);
  const { setTheme } = useTheme();
  const { defaultAlgorithm, darkAlgorithm } = theme;
  useEffect(() => {
    setTheme(isDarkMode ? "dark" : "light");
  }, [isDarkMode, setTheme]);
  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? darkAlgorithm : defaultAlgorithm,
      }}
    >
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </NextThemesProvider>
    </ConfigProvider>
  );
};
