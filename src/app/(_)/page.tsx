"use client";
import { Controls } from "@/app/(_)/convert/pick/_components/FileList/Controls";
import { TransitionOnDrag } from "@/app/_components/TransitionOnDrag";
import { ResultAtom } from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { AntContent } from "@/components/AntContent";
import { DragWatcher } from "@/components/DragWatcher";
import { Flex } from "antd";
import { useAtom, useSetAtom } from "jotai";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function Home() {
  const [files, setFiles] = useAtom(SelectedFilesAtom);
  const setResult = useSetAtom(ResultAtom);
  const mountedRef = useRef(false);
  const didRedirectRef = useRef(false);
  const router = useRouter();

  // Strict Mode対応: unmount時にrefをリセットし、remountで再度atomクリアが走るようにする
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      didRedirectRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      // マウント時にatomをリセットし、staleな状態によるリダイレクトを防ぐ
      setFiles([]);
      setResult(undefined);
      mountedRef.current = true;
      return;
    }
    if (!didRedirectRef.current && files.length > 0) {
      didRedirectRef.current = true;
      router.push("/convert/pick");
    }
  }, [files.length, setFiles, setResult, router]);

  return (
    <AntContent className={"flex-1 flex flex-col h-full"}>
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
