"use client";

import { DeckCraftEditor } from "@/app/(_convert)/convert/pick/_components/FileList/DeckCraftEditor";
import { DeckCraftSessionAtom } from "@/atoms/deckcraft";
import { usePathname } from "@/compat/navigation";
import { DragWatcher } from "@/components/DragWatcher";
import { PageContent } from "@/components/PageContent";
import { Layout } from "@/components/primitives";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";

export default function ConvertLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = useAtomValue(DeckCraftSessionAtom);
  const isPickPage = usePathname() === "/convert/pick";
  const editorActive = isPickPage && !!session;

  return (
    <Layout className={"!min-h-screen h-screen"}>
      <PageContent className={"flex flex-col overflow-hidden"}>
        <div
          className={editorActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          {session && (
            <DeckCraftEditor
              key={session.id}
              session={session}
              active={editorActive}
            />
          )}
        </div>
        <div
          className={editorActive ? "hidden" : "flex min-h-0 flex-1 flex-col"}
        >
          {children}
        </div>
        {isPickPage && <DragWatcher />}
      </PageContent>
    </Layout>
  );
}
