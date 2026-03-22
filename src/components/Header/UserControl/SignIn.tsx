import { popupSignIn } from "@/lib/auth/popupSignIn";
import { Button } from "antd";
import { useSession } from "next-auth/react";
import { useCallback, useState } from "react";

export const SignIn = () => {
  const { update } = useSession();
  const [loading, setLoading] = useState(false);

  const handleSignIn = useCallback(() => {
    setLoading(true);
    popupSignIn({
      onSuccess: async () => {
        await update();
        setLoading(false);
      },
      onError: (error) => {
        console.warn("[popupSignIn]", error);
        setLoading(false);
      },
      fallbackToRedirect: true,
    });
  }, [update]);

  return (
    <Button onClick={handleSignIn} loading={loading}>
      Sign in / Sign up
    </Button>
  );
};
