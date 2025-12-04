import type { SelectedFile } from "@/_types/file-picker";
import type { GoogleFilePickerCallbackData } from "@/_types/lib/google/filePicker";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import {
  GooglePickerTokenAtom,
  IsGooglePickerReadyAtom,
} from "@/atoms/google-picker";
import { AntContent } from "@/components/AntContent";
import { file2selectedFiles, pdf2canvases } from "@/lib/file2selectedFiles";
import { fetchFileBuffer } from "@/lib/gapi/fetchFile";
import {
  fetchSlideAsPdf,
  fetchSlideMetadata,
  requestTokenPromise,
  showFilePicker,
} from "@/lib/google";
import { LoadingOutlined } from "@ant-design/icons";
import { Button, Flex, Spin } from "antd";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { TbBrandGoogleDrive } from "react-icons/tb";

export const GooglePicker = () => {
  const [token, setToken] = useAtom(GooglePickerTokenAtom);
  const isApiLoaded = useAtomValue(IsGooglePickerReadyAtom);
  const setFiles = useSetAtom(SelectedFilesAtom);
  const [validating, setValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const showPicker = async (__token = token) => {
    const _token =
      __token ??
      (await (async () => {
        try {
          const token = await requestTokenPromise();
          setToken(token);
          return token;
        } catch (e) {
          console.error(e);
          return;
        }
      })());
    if (!_token) return;
    setValidating(true);
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user",
      {
        headers: {
          Authorization: `Bearer ${_token}`,
        },
      },
    ).then((res) => res.json());
    setValidating(false);
    if (response.user === undefined) {
      setToken(null);
      await showPicker(null);
      return;
    }
    void showFilePicker(_token, onFilePicked);
  };

  const onFilePicked = async (data: GoogleFilePickerCallbackData) => {
    if (data.action !== "picked" || !data.docs) return;
    const file = data.docs[0];
    setIsLoading(true);
    if (file.mimeType === "application/pdf") {
      const fileObj = new File(
        [await fetchFileBuffer(file.id)],
        file.name ?? "unknown file",
        {
          type: "application/pdf",
        },
      );
      const selectedFiles = await file2selectedFiles(fileObj);
      setFiles((pv) => [...pv, ...selectedFiles]);
    }
    if (file.mimeType === "application/vnd.google-apps.presentation") {
      const files = await slide2canvas(file.id);
      setFiles((pv) => [...pv, ...files]);
    }
    if (file.mimeType?.startsWith("image/")) {
      const buffer = await fetchFileBuffer(file.id);
      const fileObject = new File([buffer], file.name ?? "unknown file", {
        type: file.mimeType,
      });
      const canvas = await file2selectedFiles(fileObject);
      setFiles((pv) => [...pv, ...canvas]);
    }
    setIsLoading(false);
  };

  return (
    <>
      <Button
        disabled={!isApiLoaded && !validating}
        icon={
          isApiLoaded && !validating ? (
            <TbBrandGoogleDrive />
          ) : (
            <Spin indicator={<LoadingOutlined spin />} />
          )
        }
        onClick={() => showPicker()}
      >
        Add File From Google Drive
      </Button>
      {isLoading && (
        <div
          className={
            "fixed top-0 left-0 w-full h-full z-50 grid place-items-center"
          }
        >
          <div
            className={
              "absolute left-0 top-0 w-full h-full bg-black bg-opacity-75 -z-0"
            }
          />
          <AntContent className={"relative p-8 rounded-2xl"}>
            <Flex gap={"middle"} align={"center"}>
              <Spin indicator={<LoadingOutlined spin />} size={"large"} />
              <div>Loading data from google drive...</div>
            </Flex>
          </AntContent>
        </div>
      )}
    </>
  );
};

const slide2canvas = async (slideId: string): Promise<SelectedFile[]> => {
  const [{ canvases, buffer }, metadata] = await Promise.all([
    (async () => {
      const buffer = await fetchSlideAsPdf(slideId);
      return {
        canvases: await pdf2canvases(buffer),
        buffer,
      };
    })(),
    fetchSlideMetadata(slideId),
  ]);

  const file = new File([buffer], metadata.title, {
    type: "application/pdf",
  });

  return canvases.map((canvas, index) => ({
    id: crypto.randomUUID(),
    fileName: `${metadata.title}-${index + 1}`,
    canvas,
    note: metadata.items[index].speakerNote,
    metadata: {
      fileType: "pdf",
      file,
      index,
      scale: 1,
    },
  }));
};
