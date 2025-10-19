/**
 * ファイルサイズを人間が読みやすい形式にフォーマットします
 * @param bytes ファイルサイズ（バイト単位）
 * @returns フォーマットされた文字列（例: "1.23MB"）
 */
export const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1000 && unitIndex < units.length - 1) {
    size /= 1000;
    unitIndex++;
  }

  return `${size.toFixed(2)}${units[unitIndex]}`;
};
