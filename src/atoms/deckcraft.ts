import type { SelectedFile } from "@/_types/file-picker";
import { atom } from "jotai";

export const DeckCraftFileAtom = atom<File | null>(null);
export const DeckCraftSlidesAtom = atom<SelectedFile[] | null>(null);
