"use client";

import { Spin } from "antd";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function PopupSignInPage() {
  const calledRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    // StrictMode二重レンダリング対策
    if (calledRef.current) return;
    calledRef.current = true;
    signIn("discord", { callbackUrl: "/auth/popup/callback" }).catch(() => {
      // OAuth開始失敗時はコールバックページにエラーを渡してフォールバックUIを表示
      router.replace("/auth/popup/callback?error=OAuthSignin");
    });
  }, [router]);

  return (
    <div className="grid place-items-center min-h-screen">
      <Spin size="large" />
    </div>
  );
}
