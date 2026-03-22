import { signIn } from "next-auth/react";

type PopupSignInOptions = {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  /** ポップアップが開けない場合にフルリダイレクトにフォールバックするか (default: true) */
  fallbackToRedirect?: boolean;
  /** フルリダイレクトにフォールバックした場合のcallbackUrl (default: window.location.href) */
  callbackUrl?: string;
};

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) || window.innerWidth < 768
  );
}

// 前回の呼び出しのクリーンアップ用
let cleanupPrevious: (() => void) | null = null;

/**
 * Discord OAuthをポップアップウィンドウで実行する。
 * モバイルやポップアップブロック時はフルリダイレクトにフォールバック。
 */
export function popupSignIn(options?: PopupSignInOptions): void {
  // 前回のリスナー/タイマーをクリーンアップ
  cleanupPrevious?.();
  cleanupPrevious = null;

  const fallback = options?.fallbackToRedirect !== false;
  const callbackUrl =
    options?.callbackUrl ??
    (typeof window !== "undefined" ? window.location.href : "/");

  // モバイルではポップアップが不安定なためフルリダイレクトにフォールバック
  if (isMobileDevice()) {
    if (fallback) {
      void signIn("discord", { callbackUrl });
    } else {
      options?.onError?.("mobile-unsupported");
    }
    return;
  }

  // ポップアップをスクリーン中央に配置
  const width = 500;
  const height = 700;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  const popup = window.open(
    "/auth/popup",
    "discord-auth-popup",
    `width=${width},height=${height},left=${left},top=${top},popup=yes`,
  );

  // ポップアップがブロックされた場合
  if (!popup || popup.closed) {
    if (fallback) {
      void signIn("discord", { callbackUrl });
    } else {
      options?.onError?.("popup-blocked");
    }
    return;
  }

  // onSuccess/onErrorの二重発火を防ぐフラグ
  let settled = false;

  // ポップアップからのpostMessageを待機
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "auth-callback-complete") return;
    if (settled) return;
    settled = true;

    cleanup();

    if (event.data.success) {
      options?.onSuccess?.();
    } else {
      options?.onError?.(event.data.error ?? "unknown");
    }
  };
  window.addEventListener("message", handleMessage);

  // ポップアップが認証完了前に閉じられた場合の検出
  const pollTimer = setInterval(() => {
    if (popup.closed) {
      if (settled) {
        cleanup();
        return;
      }
      settled = true;
      cleanup();
      options?.onError?.("popup-closed");
    }
  }, 500);

  const cleanup = () => {
    window.removeEventListener("message", handleMessage);
    clearInterval(pollTimer);
    cleanupPrevious = null;
  };

  cleanupPrevious = cleanup;
}
