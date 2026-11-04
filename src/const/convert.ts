import type { FormatItemType } from "@/_types/text-zip/formats";
import { selectedFiles2EIAv1RGB24Cropped } from "@/lib/selectedFiles2EIA/selectedFiles2EIAv1RGB24Cropped";
import { selectedFiles2EIAv1RGB24CroppedBase64 } from "@/lib/selectedFiles2EIA/selectedFiles2EIAv1RGB24CroppedBase64";

export {
  FileSizeLimit,
  EIA_SIZE_LIMIT_ERROR,
  ActualFileSizeLimit,
} from "./fileSizeLimit";

/** Version number recorded for files produced by this converter (ImageSlide v0.3.x). */
export const OUTPUT_VERSION = 1;
/** Format used for every normal (non-signage) conversion. */
export const DEFAULT_FORMAT_ID = "eia-v1-RGB24-cropped";

export const TargetFormats: FormatItemType[] = [
  {
    id: "eia-v1-RGB24-cropped",
    label: "EIA v1 RGB24 (cropped)",
    bytePerPixel: 3,
    priority: 4,
    container: "eia-v1",
    format: "RGB24-cropped",
    estimatedCompressionRatio: 0.2,
    signageSupport: true,
    converter: selectedFiles2EIAv1RGB24Cropped,
  },
  {
    id: "eia-v1-RGB24-cropped-base64",
    label: "EIA v1 RGB24 (cropped, base64)",
    bytePerPixel: 4.5,
    priority: 0,
    container: "eia-v1",
    format: "RGB24-cropped-base64",
    estimatedCompressionRatio: 0.3,
    signageSupport: true,
    converter: selectedFiles2EIAv1RGB24CroppedBase64,
  },
];
