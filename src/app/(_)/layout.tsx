import { HeaderLogo } from "@/app/(_)/_components/HeaderLogo";
import { AppShell } from "@/components/AppShell";
import { PageContent } from "@/components/PageContent";
import { Flex } from "@/components/primitives";
import type { ReactNode } from "react";

export default function MainLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <AppShell>
      <PageContent className={"flex flex-col"}>
        <HeaderLogo />
        <Flex
          className={"px-8 flex-1 overflow-y-scroll"}
          vertical
          gap={"middle"}
        >
          {children}
        </Flex>
      </PageContent>
    </AppShell>
  );
}
