import type {
  FormatItemType,
  TTextureConverterFormat,
} from "@/_types/text-zip/formats";
import { selectedFiles2EIAv1RGB24Cropped } from "@/lib/selectedFiles2EIA/selectedFiles2EIAv1RGB24Cropped";
import { selectedFiles2EIAv1RGB24CroppedBase64 } from "@/lib/selectedFiles2EIA/selectedFiles2EIAv1RGB24CroppedBase64";
import {
  selectedFiles2v0RGBA32,
  selectedFiles2v1DXT1,
  selectedFiles2v1RGB24,
  selectedFiles2v1RGB24Cropped,
  selectedFiles2v1RGBA32,
} from "@/lib/selectedFiles2textZip";

export const FileSizeLimit = 95 * 1024 * 1024;
export const ActualFileSizeLimit = 100 * 1024 * 1024;

export const TargetVersions: {
  label: string;
  image: string;
  value: number;
  formats: TTextureConverterFormat[];
}[] = [
  {
    label: "v0.0.x",
    image: "/image-slide/v0.0.x.png",
    value: 0,
    formats: ["text-zip-v0-RGBA32"],
  },
  {
    label: "v0.1.x",
    image: "/image-slide/v0.1.x.png",
    value: 1,
    formats: ["text-zip-v1-RGBA32", "text-zip-v1-RGB24"],
  },
  {
    label: "v0.2.x",
    image: "/image-slide/v0.1.x.png",
    value: 1,
    formats: ["text-zip-v1-RGBA32", "text-zip-v1-RGB24", "text-zip-v1-DXT1"],
  },
  {
    label: "v0.3.x",
    image: "/image-slide/v0.1.x.png",
    value: 1,
    formats: ["eia-v1-RGB24-cropped"],
  },
];

export const TargetFormats: FormatItemType[] = [
  {
    id: "text-zip-v0-RGBA32",
    label: "TextZip v0 RGBA32",
    bytePerPixel: 4,
    priority: 0,
    container: "text-zip-v0",
    format: "RGBA32",
    converter: selectedFiles2v0RGBA32,
  },
  {
    id: "text-zip-v1-RGB24",
    label: "TextZip v1 RGB24",
    bytePerPixel: 3,
    priority: 2,
    container: "text-zip-v1",
    format: "RGB24",
    converter: selectedFiles2v1RGB24,
  },
  {
    id: "text-zip-v1-RGBA32",
    label: "TextZip v1 RGBA32",
    bytePerPixel: 4,
    priority: 0,
    container: "text-zip-v1",
    format: "RGBA32",
    converter: selectedFiles2v1RGBA32,
  },
  {
    id: "text-zip-v1-DXT1",
    label: "TextZip v1 DXT1",
    bytePerPixel: 1,
    priority: 1,
    container: "text-zip-v1",
    format: "DXT1",
    converter: selectedFiles2v1DXT1,
  },
  {
    id: "text-zip-v1-RGB24-cropped",
    label: "TextZip v1 RGB24 (cropped)",
    bytePerPixel: 3,
    priority: 3,
    container: "text-zip-v1",
    format: "RGB24-cropped",
    estimatedCompressionRatio: 0.6,
    converter: selectedFiles2v1RGB24Cropped,
  },
  {
    id: "eia-v1-RGB24-cropped",
    label: "EIA v1 RGB24 (cropped)",
    bytePerPixel: 3,
    priority: 4,
    container: "eia-v1",
    format: "RGB24-cropped",
    estimatedCompressionRatio: 0.2,
    converter: selectedFiles2EIAv1RGB24Cropped,
  },
  {
    id: "eia-v1-RGB24-cropped-base64",
    label: "EIA v1 RGB24 (cropped, base64)",
    bytePerPixel: 4.5,
    priority: 0,
    container: "eia-v1",
    format: "RGB24-cropped-base64",
    estimatedCompressionRatio: 0.2,
    converter: selectedFiles2EIAv1RGB24CroppedBase64,
  }
];
