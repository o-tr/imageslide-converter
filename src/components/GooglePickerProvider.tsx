"use client";
import { IsGooglePickerReadyAtom } from "@/atoms/google-picker";
import Script from "@/compat/script";
import { GOOGLE_API_KEY } from "@/const/env";
import { useSetAtom } from "jotai";
import { type FC, useEffect, useState } from "react";

declare global {
  namespace google {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    var accounts: any;
  }
  namespace gapi.client {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    var slides: any;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    var drive: any;
  }
}

const DISCOVERY_DOC = [
  "https://slides.googleapis.com/$discovery/rest?version=v1",
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
];

export const GooglePickerProvider: FC = () => {
  const [initCount, setInitCount] = useState(0);
  const setIsGooglePickerReady = useSetAtom(IsGooglePickerReadyAtom);

  const onApiLoad = () => {
    gapi.load("picker", () => {
      setInitCount((pv) => pv + 1);
    });
    gapi.load("client", async () => {
      await gapi.client.init({
        apiKey: GOOGLE_API_KEY,
        discoveryDocs: DISCOVERY_DOC,
      });
      setInitCount((pv) => pv + 1);
    });
  };

  const onGisLoad = () => {
    setInitCount((pv) => pv + 1);
  };

  useEffect(() => {
    if (initCount !== 3) return;
    setIsGooglePickerReady(true);
  }, [initCount, setIsGooglePickerReady]);

  return (
    <>
      <Script src="https://apis.google.com/js/api.js" onLoad={onApiLoad} />
      <Script src="https://accounts.google.com/gsi/client" onLoad={onGisLoad} />
    </>
  );
};
