import type { ComponentProps, FC } from "react";
export const PageFooter: FC<ComponentProps<"footer">> = ({
  className,
  ...props
}) => (
  <footer
    className={`shrink-0 border-t border-border bg-background px-4 py-4 text-sm text-muted-foreground ${className ?? ""}`}
    {...props}
  />
);
