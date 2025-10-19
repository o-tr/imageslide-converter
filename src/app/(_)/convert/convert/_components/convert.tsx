"use client";
import {
  ConvertFormatAtom,
  ResultAtom,
  TargetResolutionAtom,
  UsingVersionAtom,
} from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { FileSizeLimit, TargetVersions } from "@/const/convert";
import { postCompress } from "@/lib/workerService/postCompress";
import { getAvailableFormats } from "@/utils/getAvailableFormats";
import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { type FC, useEffect, useMemo, useRef } from "react";

export const Convert: FC = () => {
  const imageSlideVersion = useAtomValue(UsingVersionAtom);
  const _format = useAtomValue(ConvertFormatAtom);
  const _files = useAtomValue(SelectedFilesAtom);
  const _resolution = useAtomValue(TargetResolutionAtom);
  const setResults = useSetAtom(ResultAtom);
  const version = useMemo(() => {
    return (
      TargetVersions.find((v) => v.label === imageSlideVersion)?.value ?? 0
    );
  }, [imageSlideVersion]);
  const availableFormats = useMemo(
    () => getAvailableFormats(imageSlideVersion, _files, _resolution),
    [imageSlideVersion, _files, _resolution],
  );
  const router = useRouter();

  const bestFormat = useMemo(() => {
    return availableFormats.toSorted((a, b) => b.priority - a.priority)[0];
  }, [availableFormats]);

  const initRef = useRef(false);

  useEffect(() => {
    if (_files.length < 1) {
      router.push("./pick");
      return;
    }
    if (initRef.current) return;
    initRef.current = true;
    const { id, scale } = (() => {
      if (_format === "auto") return { id: bestFormat.id, scale: 1 };
      if (_format === "auto-one-file") {
        const scale =
          Math.floor(
            Math.min((FileSizeLimit - 1024 * 1024) / bestFormat.fileSize, 1) *
              100,
          ) / 100;
        return { id: bestFormat.id, scale };
      }
      const format = availableFormats.find((v) => v.id === _format);
      if (!format) return { id: bestFormat.id, scale: 1 };
      return { id: format.id, scale: 1 };
    })();
    postCompress(_files, id, version, scale, _resolution).then((result) => {
      setResults({
        data: result,
        format: id,
        version,
      });
      router.push("./upload");
    });
  }, [
    version,
    _format,
    _files,
    _resolution,
    bestFormat,
    router,
    setResults,
    availableFormats,
  ]);
  return <></>;
};
