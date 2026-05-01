import { Spin } from "antd";
import { type FC, useEffect, useState } from "react";

export const Preview: FC<{ canvas: OffscreenCanvas; className?: string }> = ({
  canvas,
  className = "w-[128px] h-[128px]",
}) => {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let objectUrl: string;
    canvas.convertToBlob().then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
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
        />
      ) : (
        <Spin />
      )}
    </div>
  );
};
