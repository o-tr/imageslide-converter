import type { ComponentProps, FC } from "react";
export const PageContent: FC<ComponentProps<"main">> = ({
  className,
  ...props
}) => (
  <main
    className={`min-h-0 flex-1 bg-background text-foreground ${className ?? ""}`}
    {...props}
  />
);
