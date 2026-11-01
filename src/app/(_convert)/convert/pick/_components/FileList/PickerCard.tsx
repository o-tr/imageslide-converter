import { Button } from "@/components/primitives";
import type { ReactNode } from "react";

type PickerCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
};

export function PickerCard({
  icon,
  title,
  description,
  disabled,
  onClick,
}: PickerCardProps) {
  return (
    <Button
      className="h-auto min-h-36 w-full justify-start gap-5 whitespace-normal rounded-xl border-border bg-card p-6 text-left shadow-none transition-colors hover:border-primary/40 hover:bg-accent/40 sm:min-h-40 [&_svg]:size-12"
      disabled={disabled}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-2">
        <span className="text-base font-semibold leading-snug text-foreground">
          {title}
        </span>
        <span className="text-sm font-normal leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </Button>
  );
}
