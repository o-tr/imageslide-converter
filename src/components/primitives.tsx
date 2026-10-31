import {
  Button as BaseButton,
  type ButtonProps as BaseButtonProps,
} from "@/components/ui/button";
import { Input as BaseInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlertCircle, Check, Info, LoaderCircle, X } from "lucide-react";
import {
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  cloneElement,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useState,
} from "react";

export function Flex({
  vertical,
  gap,
  align,
  justify,
  wrap,
  style,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  vertical?: boolean;
  gap?: number | "small" | "middle" | "large";
  align?: string;
  justify?: string;
  wrap?: boolean | CSSProperties["flexWrap"];
}) {
  const spacing =
    typeof gap === "number"
      ? gap
      : gap === "small"
        ? 8
        : gap === "middle"
          ? 16
          : gap === "large"
            ? 24
            : undefined;
  return (
    <div
      {...props}
      className={cn("flex", vertical && "flex-col", className)}
      style={{
        gap: spacing,
        alignItems: align === "start" ? "flex-start" : align,
        justifyContent: justify === "start" ? "flex-start" : justify,
        flexWrap: wrap === true ? "wrap" : wrap || undefined,
        ...style,
      }}
    />
  );
}
const LayoutBase = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col bg-background text-foreground", className)}
    {...props}
  />
);
export const Layout = Object.assign(LayoutBase, {
  Content: ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
    <main className={className} {...props} />
  ),
  Footer: ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
    <footer className={className} {...props} />
  ),
});

type ButtonProps = Omit<BaseButtonProps, "type" | "size"> & {
  type?: "primary" | "default" | "text" | "link";
  size?: "small" | "middle" | "large";
  icon?: ReactNode;
  loading?: boolean;
  danger?: boolean;
  htmlType?: "button" | "submit" | "reset";
  href?: string;
  target?: string;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      type,
      size,
      icon,
      loading,
      danger,
      children,
      variant,
      disabled,
      htmlType,
      href,
      target,
      ...props
    },
    ref,
  ) {
    if (href)
      return (
        <BaseButton
          asChild
          variant={variant ?? "outline"}
          size={size === "small" ? "sm" : size === "large" ? "lg" : "default"}
          {...props}
        >
          <a
            href={href}
            target={target}
            rel={target === "_blank" ? "noopener noreferrer" : undefined}
          >
            {icon}
            {children}
          </a>
        </BaseButton>
      );
    return (
      <BaseButton
        ref={ref}
        type={htmlType ?? "button"}
        variant={
          variant ??
          (danger
            ? "destructive"
            : type === "primary"
              ? "default"
              : type === "text"
                ? "ghost"
                : type === "link"
                  ? "link"
                  : "outline")
        }
        size={size === "small" ? "sm" : size === "large" ? "lg" : "default"}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <LoaderCircle className="animate-spin" /> : icon}
        {children}
      </BaseButton>
    );
  },
);

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  suffix?: ReactNode;
  onPressEnter?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
};
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { suffix, onPressEnter, onKeyDown, className, ...props },
  ref,
) {
  const input = (
    <BaseInput
      ref={ref}
      className={cn(suffix && "pr-9", className)}
      {...props}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter") onPressEnter?.(event);
      }}
    />
  );
  return suffix ? (
    <span className="relative inline-flex w-full items-center">
      {input}
      <span className="absolute right-3 text-muted-foreground">{suffix}</span>
    </span>
  ) : (
    input
  );
});
export const TextArea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    autoSize?: { minRows?: number };
  }
>(function TextArea({ className, autoSize, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={autoSize?.minRows}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
});
export function Compact({
  className,
  block: _block,
  ...props
}: HTMLAttributes<HTMLDivElement> & { block?: boolean }) {
  return (
    <div
      {...props}
      className={cn("flex w-full items-stretch gap-2", className)}
    />
  );
}

type Option<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};
export function Select<T extends string>({
  value,
  onChange,
  options = [],
  disabled,
  placeholder,
  className,
}: {
  value?: T;
  onChange?: (value: T) => void;
  options?: Option<T>[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value as T)}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
export type SpinProps = {
  size?: "small" | "default" | "large";
  percent?: number;
  indicator?: ReactNode;
};
export function Spin({ size, percent, indicator }: SpinProps) {
  return (
    <output
      aria-label={
        percent === undefined ? "読み込み中" : `${Math.round(percent)}%`
      }
      className={cn(
        "inline-flex items-center justify-center text-muted-foreground",
        size === "large" && "scale-125",
      )}
    >
      {indicator ?? <LoaderCircle className="size-5 animate-spin" />}
    </output>
  );
}
export function Alert({
  message: text,
  type,
  description,
}: {
  message: ReactNode;
  type?: string;
  showIcon?: boolean;
  description?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-md border p-4 text-sm",
        type === "error"
          ? "border-destructive/50 text-destructive"
          : "border-border bg-muted/50",
      )}
    >
      {type === "error" ? (
        <AlertCircle className="size-5 shrink-0" />
      ) : (
        <Info className="size-5 shrink-0" />
      )}
      <div>
        {text}
        {description && (
          <p className="mt-1 text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
export function Result({
  title,
  subTitle,
  extra,
}: {
  status?: string;
  title?: ReactNode;
  subTitle?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{subTitle}</p>
      {extra}
    </div>
  );
}

export function Modal({
  open = false,
  title,
  children,
  onCancel,
  onOk,
  footer,
  closable = true,
  okText = "OK",
  cancelText = "キャンセル",
  confirmLoading,
}: {
  open?: boolean;
  title?: ReactNode;
  children?: ReactNode;
  onCancel?: () => void;
  onOk?: () => void;
  footer?: ReactNode;
  closable?: boolean;
  okText?: string;
  cancelText?: string;
  confirmLoading?: boolean;
  forceRender?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && closable) onCancel?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-6 text-foreground shadow-xl focus:outline-none">
          <Dialog.Title className="pr-8 text-lg font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {typeof title === "string" ? title : "ダイアログ"}
          </Dialog.Description>
          {closable && (
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="閉じる"
                className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          )}
          <div className="mt-4">{children}</div>
          {footer !== null && (
            <div className="mt-6 flex justify-end gap-2">
              {footer === undefined ? (
                <>
                  <Button onClick={onCancel}>{cancelText}</Button>
                  <Button
                    type="primary"
                    onClick={onOk}
                    loading={confirmLoading}
                  >
                    {okText}
                  </Button>
                </>
              ) : (
                footer
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type MenuItem = {
  key: string;
  label?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
};
export type MenuProps = {
  items?: (MenuItem | null)[];
  selectedKeys?: string[];
  selectable?: boolean;
  onClick?: (event: { key: string }) => void;
};
export function Dropdown({
  children,
  menu,
  trigger,
}: {
  children: ReactElement;
  menu: MenuProps;
  trigger?: string[];
  placement?: string;
}) {
  const options = (menu.items ?? []).filter((item): item is MenuItem => !!item);
  const cls =
    "z-[110] min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg";
  const optionClass =
    "flex cursor-pointer select-none items-center gap-2 rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50";
  if (trigger?.includes("contextMenu"))
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={cls}>
            {options.map((item) => (
              <ContextMenu.Item
                key={item.key}
                disabled={item.disabled}
                className={cn(optionClass, item.danger && "text-destructive")}
                style={item.style}
                onSelect={() => {
                  item.onClick?.();
                  menu.onClick?.({ key: item.key });
                }}
              >
                {item.icon}
                {item.label}
              </ContextMenu.Item>
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={5} className={cls}>
          {options.map((item) => (
            <DropdownMenu.Item
              key={item.key}
              disabled={item.disabled}
              className={cn(optionClass, item.danger && "text-destructive")}
              style={item.style}
              onSelect={() => {
                item.onClick?.();
                menu.onClick?.({ key: item.key });
              }}
            >
              {menu.selectedKeys?.includes(item.key) && (
                <Check className="size-4" />
              )}
              {item.icon}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
export function Tooltip({
  title,
  children,
}: {
  title: string;
  children: ReactElement<{ title?: string; "aria-label"?: string }>;
  placement?: string;
}) {
  return cloneElement(children, {
    title,
    "aria-label": children.props["aria-label"] ?? title,
  });
}
export function Popconfirm({
  title,
  children,
  onConfirm,
}: { title: string; children: ReactNode; onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span
        className="inline-flex"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          )
            setOpen(true);
        }}
      >
        {children}
      </span>
      <Modal
        title={title}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => {
          setOpen(false);
          onConfirm?.();
        }}
      />
    </>
  );
}

type RadioContext = {
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
};
const radioContext = createContext<RadioContext>({});
export const Radio = {
  Group: ({
    value,
    onChange,
    children,
  }: RadioContext & { children: ReactNode }) => (
    <radioContext.Provider value={{ value, onChange }}>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {children}
      </div>
    </radioContext.Provider>
  ),
  Button: ({ value, children }: { value: string; children: ReactNode }) => {
    const group = useContext(radioContext);
    return (
      <label
        className={cn(
          "inline-flex h-9 cursor-pointer items-center rounded-md border px-4 text-sm font-medium focus-within:ring-1 focus-within:ring-ring",
          group.value === value
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background hover:bg-accent",
        )}
      >
        <input
          className="sr-only"
          type="radio"
          checked={group.value === value}
          onChange={() => group.onChange?.({ target: { value } })}
        />
        {children}
      </label>
    );
  },
};
export type StepProps = { title?: ReactNode };
export function Steps({
  items = [],
  current = 0,
}: { items?: StepProps[]; current?: number; direction?: string }) {
  return (
    <ol className="flex flex-wrap items-center gap-3 text-sm">
      {items.map((item, i) => (
        <li
          key={String(item.title)}
          className={cn(
            "flex items-center gap-2",
            i === current
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full border",
              i === current &&
                "border-primary bg-primary text-primary-foreground",
            )}
          >
            {i + 1}
          </span>
          {item.title}
          {i < items.length - 1 && (
            <span className="ml-2 text-muted-foreground">→</span>
          )}
        </li>
      ))}
    </ol>
  );
}
function ListBase<T>({
  dataSource,
  renderItem,
}: {
  itemLayout?: string;
  dataSource: T[];
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return (
    <ul className="space-y-3">
      {dataSource.map((item, index) => (
        <li key={Array.isArray(item) ? String(item[0]) : JSON.stringify(item)}>
          {renderItem(item, index)}
        </li>
      ))}
    </ul>
  );
}
export const List = Object.assign(ListBase, {
  Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
});

export type SorterResult<T> = {
  columnKey?: string | number;
  order?: "ascend" | "descend" | null;
  column?: TableColumn<T>;
};
type TableColumn<T> = {
  title?: ReactNode;
  dataIndex?: keyof T;
  key: string;
  width?: number;
  sorter?: { multiple?: number };
  sortOrder?: "ascend" | "descend" | null;
  sortDirections?: string[];
  render?: {
    bivarianceHack(value: unknown, record: T, index: number): ReactNode;
  }["bivarianceHack"];
};
export type TableColumnsType<T> = TableColumn<T>[];
export function Table<T>({
  columns,
  dataSource,
  rowKey,
  loading,
  onChange,
}: {
  columns: TableColumnsType<T>;
  dataSource: T[];
  rowKey: keyof T;
  loading?: boolean | SpinProps;
  pagination?: boolean;
  onChange?: (
    pagination: unknown,
    filters: unknown,
    sorter: SorterResult<T> | SorterResult<T>[],
  ) => void;
}) {
  const sort = (column: TableColumn<T>) => {
    if (!column.sorter) return;
    const selected = columns
      .filter((c) => c.sortOrder && c.key !== column.key)
      .map((c) => ({ columnKey: c.key, order: c.sortOrder }));
    selected.push({
      columnKey: column.key,
      order: column.sortOrder === "ascend" ? "descend" : "ascend",
    });
    onChange?.(null, null, selected);
  };
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background/70">
          <Spin />
        </div>
      )}
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted/60">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className="whitespace-nowrap border-b border-border px-4 py-3 font-medium"
              >
                {c.sorter ? (
                  <button
                    type="button"
                    onClick={() => sort(c)}
                    className="hover:underline"
                  >
                    {c.title}{" "}
                    {c.sortOrder === "ascend"
                      ? "↑"
                      : c.sortOrder === "descend"
                        ? "↓"
                        : "↕"}
                  </button>
                ) : (
                  c.title
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataSource.map((row, i) => (
            <tr
              key={String(row[rowKey])}
              className="border-b border-border last:border-0"
            >
              {columns.map((c) => {
                const value = c.dataIndex ? row[c.dataIndex] : row;
                return (
                  <td key={c.key} className="px-4 py-3">
                    {c.render ? c.render(value, row, i) : (value as ReactNode)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && dataSource.length === 0 && (
        <p className="p-6 text-center text-muted-foreground">
          ファイルはありません
        </p>
      )}
    </div>
  );
}

type Toast = {
  id: number;
  text: string;
  kind: "error" | "warning" | "success";
};
let toastId = 0;
function notify(kind: Toast["kind"], text: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("imageslide-toast", {
        detail: { id: ++toastId, text, kind },
      }),
    );
}
export const message = {
  error: (text: string) => notify("error", text),
  warning: (text: string) => notify("warning", text),
  success: (text: string) => notify("success", text),
  useMessage: () => [message, null] as const,
};
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const listener = (event: Event) => {
      const toast = (event as CustomEvent<Toast>).detail;
      setToasts((v) => [...v, toast]);
      window.setTimeout(
        () => setToasts((v) => v.filter((item) => item.id !== toast.id)),
        5000,
      );
    };
    window.addEventListener("imageslide-toast", listener);
    return () => window.removeEventListener("imageslide-toast", listener);
  }, []);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[200] flex max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <output
          key={toast.id}
          className={cn(
            "rounded-lg border bg-background px-4 py-3 text-sm shadow-lg",
            toast.kind === "error" && "border-destructive text-destructive",
          )}
        >
          {toast.text}
        </output>
      ))}
    </div>
  );
}
