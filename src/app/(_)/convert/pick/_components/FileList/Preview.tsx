import { Spin } from "antd";
import { type FC, useEffect, useState } from "react";

export const Preview: FC<{ canvas: OffscreenCanvas }> = ({ canvas }) => {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    canvas.convertToBlob().then((blob) => {
      setUrl(URL.createObjectURL(blob));
    });
  }, [canvas]);

  return (
    <div className={"w-[128px] h-[128px] text-center"}>
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
