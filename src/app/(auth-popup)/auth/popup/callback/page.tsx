"use client";

import { Button, Spin } from "antd";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * 親ウィンドウにpostMessageを送信し、ポップアップを閉じる。
 * window.openerへのアクセスがクロスオリジン制限で失敗する場合に備えてtry/catchで囲む。
 */
function notifyOpenerAndClose(message: Record<string, unknown>): boolean {
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin);
      window.close();
      return true;
    }
  } catch {
    // window.openerへのアクセスがDOMExceptionで失敗した場合はフォールバック
  }
  return false;
}

function CallbackContent() {
  const searchParams = useSearchParams();
  const [showFallback, setShowFallback] = useState(false);
  const error = searchParams.get("error");

  useEffect(() => {
    const message = error
      ? { type: "auth-callback-complete", success: false, error }
      : { type: "auth-callback-complete", success: true };

    const sent = notifyOpenerAndClose(message);
    if (!sent) {
      // ポップアップ経由でない場合は即座にフォールバックUIを表示
      setShowFallback(true);
      return;
    }

    // window.close() が効かない場合のフォールバック
    const timer = setTimeout(() => {
      setShowFallback(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [error]);

  if (!showFallback) return null;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg">ログインに失敗しました</p>
        <p className="text-sm text-gray-500">{error}</p>
        <Link href="/">
          <Button type="primary">トップページへ戻る</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-lg">ログインが完了しました</p>
      <p className="text-sm text-gray-500">このウィンドウを閉じてください</p>
      <Link href="/">
        <Button type="primary">トップページへ戻る</Button>
      </Link>
    </div>
  );
}

export default function PopupCallbackPage() {
  return (
    <div className="grid place-items-center flex-1">
      <Suspense fallback={<Spin size="large" />}>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
