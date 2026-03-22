import type { ReactNode } from "react";

/**
 * ポップアップ用の最小レイアウト。Header/Footerを表示しない。
 */
export default function AuthPopupLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <main className="grid place-items-center min-h-screen">{children}</main>
  );
}
