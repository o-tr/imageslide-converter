import { useEffect, useRef } from "react";
export default function Script({
  src,
  onLoad,
}: { src: string; onLoad: () => void }) {
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  useEffect(() => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => onLoadRef.current();
    document.head.append(script);
    return () => {
      script.remove();
    };
  }, [src]);
  return null;
}
