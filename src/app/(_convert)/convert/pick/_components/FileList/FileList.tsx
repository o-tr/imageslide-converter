"use client";

import { HeaderLogo } from "@/app/(_)/_components/HeaderLogo";
import { DeckCraftSessionAtom } from "@/atoms/deckcraft";
import { Flex } from "@/components/primitives";
import { useAtomValue } from "jotai";
import { Controls } from "./Controls";

export const FileList = () => {
  const session = useAtomValue(DeckCraftSessionAtom);

  if (session) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <HeaderLogo />
      <div className="grid flex-1 place-items-center">
        <Flex vertical gap="middle" className="w-full max-w-3xl px-6">
          <h2 className="text-2xl">利用可能な形式</h2>
          <div>
            <p>ローカルファイル: PPTX/PDF/画像</p>
            <p>Google Drive: PPTX/PDF/画像/Google スライド</p>
          </div>
          <Controls />
        </Flex>
      </div>
    </div>
  );
};
