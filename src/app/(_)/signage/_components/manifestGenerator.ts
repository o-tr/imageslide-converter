import type { EIASignageItem, EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import { FileHashCache } from "./fileUtils";
import type { SignboardConfig } from "./types";

export class ManifestGenerator {
  private hashCache = new FileHashCache();

  async generateManifest(config: SignboardConfig): Promise<{
    manifest: EIASignageManifest;
    files: SelectedFile[];
  }> {
    // 画像の重複排除: ファイルのSHA-256で一意化
    const fileMap = new Map<string, SelectedFile>();

    // hash計算を全row・全画像で並列化し、imgごとにhashを保持
    const imgHashes: string[][] = await Promise.all(
      config.rows.map(async (row) => {
        // row内の画像ごとにhash計算を並列化
        const hashes = await Promise.all(
          row.images.map(async (img) => {
            if (img.file) {
              const hash = await this.hashCache.calcFileHash(img.file);
              if (!fileMap.has(hash)) {
                fileMap.set(hash, img.file);
              }
              return hash;
            }
            return "";
          }),
        );
        return hashes;
      }),
    );

    // files: 重複を除いたSelectedFile配列
    const files = Array.from(fileMap.values());

    // hash→indexマップを同期的に構築
    const hashToIndex = new Map<string, number>();
    const fileHashes = await Promise.all(
      files.map((file) => this.hashCache.calcFileHash(file)),
    );
    fileHashes.forEach((hash, idx) => {
      hashToIndex.set(hash, idx);
    });

    // manifest生成: imgHashesからfilesのindexを参照
    const manifest: EIASignageManifest = config.signboards.reduce(
      (acc, sb, sbIdx) => {
        acc[sb.name] = config.rows.map<EIASignageItem>((row, rowIdx) => {
          const hash = imgHashes[rowIdx][sbIdx];
          const fileIdx =
            hash && hashToIndex.has(hash) ? hashToIndex.get(hash) : undefined;
          return {
            f: fileIdx !== undefined ? String(fileIdx) : "",
            t: row.images[sbIdx]?.transition || "None",
            d: row.duration,
          };
        });
        return acc;
      },
      {} as EIASignageManifest,
    );

    return { manifest, files };
  }
}
