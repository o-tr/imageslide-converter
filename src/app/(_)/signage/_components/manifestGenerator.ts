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

    // hash計算を先に全て行い、imgごとにhashを保持
    const imgHashes: string[][] = [];
    for (const row of config.rows) {
      const rowHashes: string[] = [];
      for (const img of row.images) {
        if (img.file) {
          const hash = await this.hashCache.calcFileHash(img.file);
          rowHashes.push(hash);
          if (!fileMap.has(hash)) {
            fileMap.set(hash, img.file);
          }
        } else {
          rowHashes.push("");
        }
      }
      imgHashes.push(rowHashes);
    }

    // files: 重複を除いたSelectedFile配列
    const files = Array.from(fileMap.values());

    // hash→indexマップ
    const hashToIndex = new Map<string, number>();
    files.forEach((file, idx) => {
      this.hashCache.calcFileHash(file).then((hash) => {
        hashToIndex.set(hash, idx);
      });
    });

    await Promise.all(files.map((file) => this.hashCache.calcFileHash(file)));

    files.forEach((file, idx) => {
      const hash = [...fileMap.entries()].find(([, v]) => v === file)?.[0];
      if (hash) hashToIndex.set(hash, idx);
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
