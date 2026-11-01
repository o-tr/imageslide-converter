"use client";
import { Controls } from "@/app/(_convert)/convert/pick/_components/FileList/Controls";
import { TransitionOnDrag } from "@/app/_components/TransitionOnDrag";
import { ResultAtom } from "@/atoms/convert";
import { SetDeckCraftSessionAtom } from "@/atoms/deckcraft";
import Image from "@/compat/image";
import { DragWatcher } from "@/components/DragWatcher";
import { PageContent } from "@/components/PageContent";
import { Flex } from "@/components/primitives";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

export default function Home() {
  const setSession = useSetAtom(SetDeckCraftSessionAtom);
  const setResult = useSetAtom(ResultAtom);

  useEffect(() => {
    setSession(null);
    setResult(undefined);
  }, [setSession, setResult]);

  return (
    <PageContent className={"flex-1 flex flex-col h-full"}>
      <Flex
        className={"flex-1"}
        justify={"center"}
        align={"center"}
        gap={32}
        vertical
      >
        <Flex align={"center"} gap={"middle"}>
          <Image
            src={"/icon.png"}
            alt={"logo"}
            width={64}
            height={64}
            className="rounded-2xl"
          />
          <h1 className={"text-2xl font-semibold tracking-tight sm:text-3xl"}>
            ImageSlide Converter
          </h1>
        </Flex>
        <Controls />
      </Flex>
      <div className="mx-auto max-w-5xl space-y-1 px-4 pb-4 text-center text-xs leading-relaxed text-muted-foreground">
        <p>
          スライドを TextZip 形式に変換し、ImageSlide
          で読み込めるようにするためのツールです
        </p>
        <p>
          ログインすると、ファイルの管理や高可用サーバーの利用が可能になります
        </p>
        <p>
          ファイル保持期間は通常サーバーがゲスト7日間、ユーザー30日間、高可用性サーバーがユーザー7日間です
        </p>
      </div>
      <TransitionOnDrag />
      <DragWatcher />
    </PageContent>
  );
}
