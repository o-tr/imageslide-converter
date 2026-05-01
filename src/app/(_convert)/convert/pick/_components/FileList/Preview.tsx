import { Spin } from "antd";
import { type FC, useEffect, useState } from "react";

export const Preview: FC<{ canvas: OffscreenCanvas; className?: string }> = ({
  canvas,
  className = "w-[128px] h-[128px]",
}) => {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string;
    setUrl(undefined);
    canvas.convertToBlob().then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [canvas]);

  return (
    <div className={`text-center ${className}`}>
      {url ? (
        <img
          className={"object-contain w-full h-full"}
          src={url}
          alt={"preview"}
          draggable={false}
        />
      ) : (
        <Spin />
      )}
    </div>
  );
};
