import { signIn } from "next-auth/react";

type PopupSignInOptions = {
  onSuccess?: () => void | Promise<void>;
  onError?: (error: string) => void | Promise<void>;
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
    ) || screen.width < 768
  );
}

/**
 * 前回の呼び出しのクリーンアップ用。
 * モジュールレベルのシングルトン変数であり、同一タブ内のすべてのコンポーネントで共有される。
 * 複数箇所から同時に呼ばれた場合、後の呼び出しが前の呼び出しのリスナーを破棄する。
 */
let cleanupPrevious: (() => void) | null = null;

/**
 * Discord OAuthをポップアップウィンドウで実行する。
 * モバイルやポップアップブロック時はフルリダイレクトにフォールバック。
 * @returns クリーンアップ関数。リスナー/タイマーを解除しポップアップフローを中断する。
 *          フォールバック（リダイレクト/モバイル）の場合は null。
 */
export function popupSignIn(options?: PopupSignInOptions): (() => void) | null {
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
      void options?.onError?.("mobile-unsupported");
    }
    return null;
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
      void options?.onError?.("popup-blocked");
    }
    return null;
  }

  // onSuccess/onErrorの二重発火を防ぐフラグ
  let settled = false;

  // handleMessage, pollTimer, cleanup は相互参照するクロージャ群。
  // 各関数は非同期でのみ呼ばれるため、宣言順に関わらずランタイムでは初期化済み。
  // pollTimer を const にするため、cleanup を最後に宣言する。

  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "auth-callback-complete") return;
    if (settled) return;
    settled = true;

    cleanup();

    if (event.data.success) {
      void options?.onSuccess?.();
    } else {
      void options?.onError?.(event.data.error ?? "unknown");
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
      void options?.onError?.("popup-closed");
    }
  }, 500);

  const cleanup = () => {
    window.removeEventListener("message", handleMessage);
    clearInterval(pollTimer);
    cleanupPrevious = null;
  };

  cleanupPrevious = cleanup;

  return cleanup;
}
