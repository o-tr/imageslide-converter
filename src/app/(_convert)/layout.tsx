import { PageContent } from "@/components/PageContent";
import { Layout } from "@/components/primitives";
import type { ReactNode } from "react";

export default function ConvertLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Layout className={"!min-h-screen h-screen"}>
      <PageContent className={"flex flex-col overflow-hidden"}>
        {children}
      </PageContent>
    </Layout>
  );
}
