import { LoaderCircle, Settings } from "lucide-react";
import type { CSSProperties } from "react";
export function LoadingOutlined({
  spin = true,
  style,
}: { spin?: boolean; style?: CSSProperties }) {
  return <LoaderCircle style={style} className={spin ? "animate-spin" : ""} />;
}
export function SettingOutlined() {
  return <Settings />;
}
