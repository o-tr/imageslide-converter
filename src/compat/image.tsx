import type { ImgHTMLAttributes } from "react";
export default function Image({
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  return <img {...props} alt={alt} />;
}
