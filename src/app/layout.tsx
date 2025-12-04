import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { GooglePickerProvider } from "@/components/GooglePickerProvider";
import { Header } from "@/components/Header";
import { PdfjsProvider } from "@/components/PdfjsProviderClient";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Layout } from "antd";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "ImageSlide Converter",
  description: "convert pdf/images to textzip",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <AntdRegistry>
          <ThemeProvider>
            <SessionProvider>
              <Layout className={"!min-h-screen h-screen"}>
                <Header />
                {children}
                <Footer />
              </Layout>
            </SessionProvider>
          </ThemeProvider>
          <PdfjsProvider />
          <GooglePickerProvider />
        </AntdRegistry>
      </body>
    </html>
  );
}
