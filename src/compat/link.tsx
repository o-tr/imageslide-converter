import { useRouter } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export default function Link({ href, onClick, target, rel, ...props }: Props) {
  const router = useRouter();
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === "_blank" ||
      event.currentTarget.origin !== window.location.origin
    )
      return;
    event.preventDefault();
    const url = new URL(event.currentTarget.href);
    router.history.push(url.pathname + url.search + url.hash);
  };
  return (
    <a
      {...props}
      href={href}
      target={target}
      rel={rel ?? (target === "_blank" ? "noopener noreferrer" : undefined)}
      onClick={click}
    />
  );
}
