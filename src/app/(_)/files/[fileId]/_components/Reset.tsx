"use client";
import { ResultAtom } from "@/atoms/convert";
import { SetDeckCraftSessionAtom } from "@/atoms/deckcraft";
import { useSetAtom } from "jotai/index";
import { type FC, useEffect } from "react";

export const Reset: FC = () => {
  const setResult = useSetAtom(ResultAtom);
  const setSession = useSetAtom(SetDeckCraftSessionAtom);

  useEffect(() => {
    setResult(undefined);
    setSession(null);
  }, [setResult, setSession]);
  return <></>;
};
