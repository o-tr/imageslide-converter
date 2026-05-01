"use client";
import { ResultAtom } from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { getNormalFileId } from "@/lib/service/getNormalFileId";
import { getNormalPreSignedPut } from "@/lib/service/getNormalPreSignedPut";
import { postRegisterFile } from "@/lib/service/postRegisterFile";
import { Flex, List, Spin } from "antd";
import axios, { type AxiosProgressEvent } from "axios";
import { useAtomValue } from "jotai";
import { useRouter } from "next/navigation";
import { type FC, useEffect, useRef, useState } from "react";
import { Completed } from "./Completed";
import { Preparing } from "./Preparing";

export const Upload: FC = () => {
  const result = useAtomValue(ResultAtom);
  const [progress, setProgress] = useState<{ [fileName: string]: number }>({});

  const files = useAtomValue(SelectedFilesAtom);
  const router = useRouter();
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    if (!result || result.data.length === 0) {
      router.push("./pick");
      return;
    }
    initRef.current = true;
    void (async () => {
      const data = result.data.map<{ fileSize: number; file: File }>(
        (input) => {
          const file = new File(
            [
              typeof input === "string"
                ? new TextEncoder().encode(input)
                : new Uint8Array(input),
            ],
            typeof input === "string" ? "file.txt" : "file.bin",
            {
              type:
                typeof input === "string"
                  ? "text/plain"
                  : "application/octet-stream",
            },
          );
          return { fileSize: input.length, file };
        },
      );
      const fileId = await getNormalFileId();
      const contentLengths = data.map((input) => input.fileSize);
      const preSignedPut = await getNormalPreSignedPut(fileId, contentLengths);
      await Promise.all(
        preSignedPut.map(async (val) => {
          const { file } = data[val.index];
          const onProgress = (progressEvent: AxiosProgressEvent) => {
            setProgress((pv) => ({
              ...pv,
              [`${fileId}_${val.index}`]:
                progressEvent.loaded / (progressEvent.total ?? 1),
            }));
          };
          await axios.put(val.url, file, {
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            onUploadProgress: onProgress,
          });
        }),
      );
      await postRegisterFile(
        fileId,
        files[0].fileName,
        data.length,
        data.reduce((acc, { fileSize }) => acc + fileSize, 0),
        result.format,
        result.version,
      );

      setTimeout(() => {
        router.push(`/files/${fileId}`);
      }, 100);
    })();
  }, [result, files, router]);

  if (Object.keys(progress).length === 0) {
    return <Preparing />;
  }
  if (
    Object.entries(progress).reduce((acc, [_, value]) => acc + value, 0) ===
    result?.data.length
  ) {
    return <Completed />;
  }

  return (
    <div className={"flex-1 grid place-items-center"}>
      <List
        itemLayout="horizontal"
        dataSource={Object.entries(progress)}
        renderItem={(item) => (
          <List.Item>
            <Flex gap={"middle"} align={"center"}>
              <Spin percent={Math.floor(item[1] * 100)} size={"large"} />
              <div>{item[0]}</div>
            </Flex>
          </List.Item>
        )}
      />
    </div>
  );
};
