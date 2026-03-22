import { popupSignIn } from "@/lib/auth/popupSignIn";
import { Button } from "antd";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

export const SignIn = () => {
  const { update } = useSession();
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // アンマウント時にリスナー/タイマーを解除
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      cancelRef.current = null;
    };
  }, []);

  const handleSignIn = useCallback(() => {
    cancelRef.current?.();
    setLoading(true);
    const cancel = popupSignIn({
      onSuccess: async () => {
        cancelRef.current = null;
        await update();
        setLoading(false);
      },
      onError: (error) => {
        cancelRef.current = null;
        console.warn("[popupSignIn]", error);
        setLoading(false);
      },
      fallbackToRedirect: true,
    });
    cancelRef.current = cancel;

    // フォールバックリダイレクトの場合は null が返る。
    // リダイレクトが遅延・失敗した場合に備えてローディングを解除する。
    if (cancel === null) {
      setLoading(false);
    }
  }, [update]);

  return (
    <Button onClick={handleSignIn} loading={loading}>
      Sign in / Sign up
    </Button>
  );
};
