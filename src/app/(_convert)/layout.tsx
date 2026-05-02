import { AntContent } from "@/components/AntContent";
import { Layout } from "antd";
import type { ReactNode } from "react";

export default function ConvertLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Layout className={"!min-h-screen h-screen"}>
      <AntContent className={"flex flex-col overflow-hidden"}>
        {children}
      </AntContent>
    </Layout>
  );
}
