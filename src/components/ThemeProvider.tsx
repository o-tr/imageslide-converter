"use client";
import { ThemeIsDarkAtom } from "@/atoms/theme";
import { ConfigProvider, theme } from "antd";
import { useAtomValue } from "jotai";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { type FC, type ReactNode, useEffect } from "react";

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const isDarkMode = useAtomValue(ThemeIsDarkAtom);
  const { defaultAlgorithm, darkAlgorithm } = theme;
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
        <ThemeSync />
      </NextThemesProvider>
    </ConfigProvider>
  );
};

const ThemeSync = () => {
  const { setTheme } = useTheme();
  const isDarkMode = useAtomValue(ThemeIsDarkAtom);
  useEffect(() => {
    setTheme(isDarkMode ? "dark" : "light");
  }, [isDarkMode, setTheme]);
  return null;
};
