import { DeckCraftSessionAtom } from "@/atoms/deckcraft";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { Provider, createStore } from "jotai";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileList } from "./convert/pick/_components/FileList/FileList";
import ConvertLayout from "./layout";

const route = vi.hoisted(() => ({ pathname: "/convert/pick" }));

vi.mock("@/compat/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/components/DragWatcher", () => ({ DragWatcher: () => null }));
vi.mock("@/app/(_)/_components/HeaderLogo", () => ({
  HeaderLogo: () => <div>Header</div>,
}));
vi.mock("./convert/pick/_components/FileList/Controls", () => ({
  Controls: () => <div>Picker controls</div>,
}));
vi.mock(
  "@/app/(_convert)/convert/pick/_components/FileList/DeckCraftEditor",
  () => ({
    DeckCraftEditor: ({ active }: { active: boolean }) => (
      <div data-editor="deckcraft" data-active={String(active)} />
    ),
  }),
);

describe("conversion editor flow", () => {
  beforeEach(() => {
    route.pathname = "/convert/pick";
  });

  it("shows file selection rather than the old editor for exported slides", () => {
    const store = createStore();
    store.set(SelectedFilesAtom, [
      {
        id: "old-export",
        fileName: "slide.png",
        canvas: {} as OffscreenCanvas,
        metadata: { fileType: "image" },
      },
    ]);
    const html = renderToStaticMarkup(
      <Provider store={store}>
        <ConvertLayout>
          <FileList />
        </ConvertLayout>
      </Provider>,
    );
    expect(html).toContain("Picker controls");
    expect(html).not.toContain('data-editor="deckcraft"');
    expect(html).not.toContain("スピーカーノート");
  });

  it("renders the editor hidden during conversion", () => {
    const store = createStore();
    store.set(DeckCraftSessionAtom, {
      id: "session-1",
      kind: "pptx",
      file: new File([], "slides.pptx"),
    });
    const render = () =>
      renderToStaticMarkup(
        <Provider store={store}>
          <ConvertLayout>
            <span>Conversion content</span>
          </ConvertLayout>
        </Provider>,
      );

    const editing = render();
    expect(editing).toContain('data-editor="deckcraft" data-active="true"');
    expect(editing).toContain('class="hidden"><span>Conversion content');

    route.pathname = "/convert/convert";
    const converting = render();
    expect(converting).toContain('class="hidden"><div data-editor="deckcraft"');
    expect(converting).toContain('data-active="false"');
    expect(converting).toContain("Conversion content");
  });
});
