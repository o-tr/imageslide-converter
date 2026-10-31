import { DeckCraftFileAtom, DeckCraftSlidesAtom } from "@/atoms/deckcraft";
import { usePathname, useRouter } from "@/compat/navigation";
import { Button, message } from "@/components/primitives";
import { files2selectedFiles } from "@/lib/file2selectedFiles";
import { useSetAtom } from "jotai";
import { type ChangeEvent, useRef, useState } from "react";
import { TfiHarddrive } from "react-icons/tfi";
import { PickerCard } from "./PickerCard";

export const LocalFilePicker = ({
  variant = "compact",
}: { variant?: "card" | "compact" }) => {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const setDeckCraftFile = useSetAtom(DeckCraftFileAtom);
  const setSlides = useSetAtom(DeckCraftSlidesAtom);

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const files = e.target.files;
    if (!files) return;
    const pptx = Array.from(files).filter((file) => /\.pptx$/i.test(file.name));
    if (pptx.length > 1) {
      message.warning("PPTX は一度に 1 ファイルずつ開いてください");
      e.target.value = "";
      return;
    }
    if (pptx.length && files.length > 1) {
      message.warning("PPTX は単独で開いてください");
      e.target.value = "";
      return;
    }
    if (pptx.length) {
      setDeckCraftFile(pptx[0]);
      if (pathname !== "/convert/pick") router.push("/convert/pick");
      e.target.value = "";
      return;
    }
    const rest = Array.from(files).filter(
      (file) => !/\.pptx$/i.test(file.name),
    );
    const input = e.target;
    setLoading(true);
    try {
      const processed = await files2selectedFiles(rest);
      if (processed.length) {
        setSlides(processed);
        if (pathname !== "/convert/pick") router.push("/convert/pick");
      }
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "ファイルを開けませんでした",
      );
    } finally {
      input.value = "";
      setLoading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        className={"hidden"}
        multiple={true}
        type="file"
        accept={"image/*,application/pdf,.pptx"}
        onChange={onChange}
      />
      {variant === "card" ? (
        <PickerCard
          icon={<TfiHarddrive />}
          title="ローカルファイルから選択"
          description={
            loading
              ? "ファイルを読み込んでいます…"
              : "PPTX・PDF・画像を選んでスライドを編集します。"
          }
          disabled={loading}
          onClick={onButtonClick}
        />
      ) : (
        <Button
          icon={<TfiHarddrive />}
          loading={loading}
          onClick={onButtonClick}
        >
          Add File From Local
        </Button>
      )}
    </>
  );
};
