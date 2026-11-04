import { Check, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

const stages = ["画像化", "関係を解析", "圧縮", "アップロード"];

export function ConversionStatus({
  title,
  detail,
  stage,
  progress,
  children,
}: {
  title: string;
  detail: string;
  stage: number;
  progress?: number;
  children?: ReactNode;
}) {
  const percent =
    progress === undefined
      ? undefined
      : Math.max(0, Math.min(100, Math.floor(progress * 100)));
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-hidden px-4">
      <div
        data-relation-label
        className="relative z-10 w-full max-w-md px-4 py-6 text-center [text-shadow:0_1px_8px_var(--background)]"
      >
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-primary/20 bg-primary/5 text-primary">
          <LoaderCircle
            className="size-5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        </div>
        <div>
          <div aria-live="polite" aria-atomic="true">
            <h2 className="mt-4 text-xl font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          </div>
          {percent !== undefined && (
            <div className="mx-auto mt-5 max-w-[250px]">
              <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
                <span>送信状況</span>
                <span className="font-medium tabular-nums text-foreground">
                  {percent}%
                </span>
              </div>
              <progress
                aria-label="アップロードの進捗"
                value={percent}
                max={100}
                className="block h-1.5 w-full overflow-hidden rounded-full accent-primary"
              />
            </div>
          )}
        </div>
        <ol
          aria-label="変換の進行状況"
          className="mx-auto mt-7 flex max-w-sm items-start justify-center gap-1 sm:gap-2"
        >
          {stages.map((label, index) => (
            <li
              key={label}
              aria-current={index === stage ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span
                className={`grid size-6 place-items-center rounded-full border text-[10px] font-semibold ${index < stage ? "border-primary/30 bg-primary/15 text-primary" : index === stage ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
              >
                {index < stage ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`whitespace-nowrap text-[10px] sm:text-xs ${index === stage ? "font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
        {children && (
          <div className="mt-5 text-xs text-muted-foreground">{children}</div>
        )}
      </div>
    </div>
  );
}
