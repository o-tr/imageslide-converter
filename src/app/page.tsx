"use client";
import { Controls } from "@/app/(_)/convert/pick/_components/FileList/Controls";
import { TransitionOnDrag } from "@/app/_components/TransitionOnDrag";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { AntContent } from "@/components/AntContent";
import { DragWatcher } from "@/components/DragWatcher";
import { Flex } from "antd";
import { useAtomValue } from "jotai";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function Home() {
  const files = useAtomValue(SelectedFilesAtom);
  const prevCountRef = useRef(files.length);
  const router = useRouter();

  useEffect(() => {
    if (prevCountRef.current === 0 && files.length > 0) {
      router.push("/convert/pick");
    }
    prevCountRef.current = files.length;
  }, [files.length, router]);

  return (
    <AntContent className={"flex-1 flex flex-col"}>
      <Flex
        className={"flex-1"}
        justify={"center"}
        align={"center"}
        gap={64}
        vertical
      >
        <Flex align={"center"} gap={"middle"}>
          <Image src={"/icon.png"} alt={"logo"} width={64} height={64} />
          <span className={"text-2xl"}>ImageSlide Converter</span>
        </Flex>
        <div className={"px-24"}>
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
        <Controls />
      </Flex>
      <TransitionOnDrag />
      <DragWatcher />
    </AntContent>
  );
}
