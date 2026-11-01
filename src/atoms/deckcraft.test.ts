import type { SelectedFile } from "@/_types/file-picker";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { DeckCraftSessionAtom, SetDeckCraftSessionAtom } from "./deckcraft";
import { SelectedFilesAtom } from "./file-drop";

const slide = {
  id: "slide-1",
  fileName: "slide.png",
  canvas: {} as OffscreenCanvas,
  metadata: { fileType: "image" },
} satisfies SelectedFile;

describe("DeckCraft session", () => {
  it("replaces the input and clears previously exported slides", () => {
    const store = createStore();
    const file = new File(["presentation"], "slides.pptx");
    store.set(SelectedFilesAtom, [slide]);
    store.set(SetDeckCraftSessionAtom, { kind: "pptx", file });

    const first = store.get(DeckCraftSessionAtom);
    expect(first).toMatchObject({ kind: "pptx", file });
    expect(store.get(SelectedFilesAtom)).toEqual([]);

    store.set(SelectedFilesAtom, [slide]);
    store.set(SetDeckCraftSessionAtom, { kind: "slides", slides: [slide] });
    const second = store.get(DeckCraftSessionAtom);
    expect(second).toMatchObject({ kind: "slides", slides: [slide] });
    expect(second?.id).not.toBe(first?.id);
    expect(store.get(SelectedFilesAtom)).toEqual([]);
  });

  it("keeps the editor session when slides are exported, and clears both on close", () => {
    const store = createStore();
    store.set(SetDeckCraftSessionAtom, { kind: "slides", slides: [slide] });
    const session = store.get(DeckCraftSessionAtom);

    store.set(SelectedFilesAtom, [slide]);
    expect(store.get(DeckCraftSessionAtom)).toBe(session);
    expect(store.get(SelectedFilesAtom)).toEqual([slide]);

    store.set(SetDeckCraftSessionAtom, null);
    expect(store.get(DeckCraftSessionAtom)).toBeNull();
    expect(store.get(SelectedFilesAtom)).toEqual([]);
  });
});
