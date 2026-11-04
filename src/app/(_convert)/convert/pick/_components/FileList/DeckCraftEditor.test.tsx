import { Provider, createStore } from "jotai";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DeckCraftEditor, deckCraftStartupError } from "./DeckCraftEditor";

vi.mock("@/compat/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("../Settings", () => ({ SettingsPanel: () => null }));

it("covers the editor with an accessible loading state until the file opens", () => {
  const html = renderToStaticMarkup(
    <Provider store={createStore()}>
      <DeckCraftEditor
        active
        session={{
          id: "loading-session",
          kind: "pptx",
          file: new File([], "slides.pptx"),
        }}
      />
    </Provider>,
  );

  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain("<iframe");
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("DeckCraft 本体");
  expect(html).toContain("deckcraft-loading-bar");
  expect(html).toContain("戻る");
});

it("exposes startup failures instead of leaving the loading cover in place", () => {
  expect(deckCraftStartupError("Loading DeckCraft…")).toBeNull();
  expect(deckCraftStartupError(null)).toBeNull();
  expect(
    deckCraftStartupError("フォントを読み込めませんでした: 一覧なし"),
  ).toBe("フォントを読み込めませんでした: 一覧なし");
  expect(deckCraftStartupError("必要なフォントを読み込めませんでした")).toBe(
    "必要なフォントを読み込めませんでした",
  );
  expect(deckCraftStartupError("DeckCraft failed to start: WebGL2")).toBe(
    "DeckCraft failed to start: WebGL2",
  );
});
