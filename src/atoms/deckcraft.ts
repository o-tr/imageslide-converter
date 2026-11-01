import type { SelectedFile } from "@/_types/file-picker";
import { createId } from "@/lib/createId";
import { atom } from "jotai";
import { SelectedFilesAtom } from "./file-drop";

export type DeckCraftInput =
  | { kind: "pptx"; file: File }
  | { kind: "slides"; slides: SelectedFile[] };

export type DeckCraftSession = DeckCraftInput & { id: string };

export const DeckCraftSessionAtom = atom<DeckCraftSession | null>(null);

// Opening or closing an editor invalidates any previously exported slides.
export const SetDeckCraftSessionAtom = atom(
  null,
  (_get, set, input: DeckCraftInput | null) => {
    set(SelectedFilesAtom, []);
    set(DeckCraftSessionAtom, input ? { ...input, id: createId() } : null);
  },
);
