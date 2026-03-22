"use client";

import { Spin } from "antd";
import { signIn } from "next-auth/react";
import { useEffect, useRef } from "react";

export default function PopupSignInPage() {
  const calledRef = useRef(false);

  useEffect(() => {
    // StrictMode二重レンダリング対策
    if (calledRef.current) return;
    calledRef.current = true;
    void signIn("discord", { callbackUrl: "/auth/popup/callback" });
  }, []);

  return (
    <div className="grid place-items-center flex-1">
      <Spin size="large" />
    </div>
  );
}
