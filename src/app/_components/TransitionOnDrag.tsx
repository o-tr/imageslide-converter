"use client";
import { IsDragOverAtom } from "@/atoms/file-drop";
import { useRouter } from "@/compat/navigation";
import { useAtomValue } from "jotai";
import { type FC, useEffect } from "react";

export const TransitionOnDrag: FC = () => {
  const isDragOver = useAtomValue(IsDragOverAtom);
  const router = useRouter();

  useEffect(() => {
    if (isDragOver) {
      void router.push("/convert/pick");
    }
  }, [isDragOver, router]);

  return <></>;
};
