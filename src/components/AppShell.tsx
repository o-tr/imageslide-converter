import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Layout } from "@/components/primitives";
import type { ReactNode } from "react";

/**
 * アプリケーション共通のシェル（Header + Footer）。
 * ポップアップなどHeader/Footer不要なルートグループでは使用しない。
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Layout className={"!min-h-screen h-screen"}>
      <Header />
      {children}
      <Footer />
    </Layout>
  );
}
