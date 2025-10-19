"use client";
import { ResultAtom, TargetResolutionAtom } from "@/atoms/convert";
import { SignageConvertAtom } from "@/atoms/signage-convert";
import { postCompressSignage } from "@/lib/workerService/postCompressSignage";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { type FC, useEffect, useRef } from "react";

export const Convert: FC = () => {
  const data = useAtomValue(SignageConvertAtom);
  if (!data) return <></>;
  const { signage, files: _files } = data;
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

    postCompressSignage(
      _files,
      signage,
      "eia-v1-RGB24-cropped",
      1,
      1,
      resolution,
    ).then((result) => {
      setResults({
        data: result,
        format: "eia-v1-RGB24-cropped",
        version: 1,
      });
      router.push("/convert/upload");
    });
  }, [_files, signage, router, setResults, resolution]);
  return <></>;
};
