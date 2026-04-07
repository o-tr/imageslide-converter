"use client";
import { ResultAtom, TargetResolutionAtom } from "@/atoms/convert";
import { SignageConvertAtom } from "@/atoms/signage-convert";
import { postCompressSignage } from "@/lib/workerService/postCompressSignage";
import { message } from "antd";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { type FC, useEffect, useRef } from "react";

export const Convert: FC = () => {
  const data = useAtomValue(SignageConvertAtom);
  if (!data) return <></>;
  const { signage, files: _files, format } = data;
  const resolution = useAtomValue(TargetResolutionAtom);
  const setResults = useSetAtom(ResultAtom);
  const router = useRouter();

  const initRef = useRef(false);

  useEffect(() => {
    if (_files.length < 1) {
      router.push("./pick");
      return;
    }
    if (initRef.current) return;
    initRef.current = true;

    postCompressSignage(_files, signage, format, 1, 1, resolution)
      .then((result) => {
        setResults({
          data: result,
          format: format,
          version: 1,
        });
        router.push("/convert/upload");
      })
      .catch((e) => {
        setResults(undefined);
        initRef.current = false;
        console.error("Signage compression failed:", e);
        void message.error("変換に失敗しました");
      });
  }, [_files, signage, format, router, setResults, resolution]);
  return <></>;
};
