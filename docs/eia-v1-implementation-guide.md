# EIA v1 実装ガイド

## 概要

本文書は、EIA v1フォーマットの実装ガイダンスを提供し、エンコーディング戦略、最適化技術、一般的な使用例を含みます。

## 1. エンコーディング戦略

### 1.1 キーフレーム選択

エンコーダーは圧縮効率とランダムアクセスのバランスを取るためキーフレーム間隔を使用すべきです（SHOULD）：

```typescript
const keyframeInterval = 10; // 10フレームごとがキーフレーム
```

利点：
- **圧縮**: 長い間隔はより良い圧縮を提供
- **アクセス**: 短い間隔は高速なランダムアクセスを可能にする
- **エラー回復**: キーフレームはエラー伝播を制限

### 1.2 差分エンコーディングプロセス

1. **ベース画像選択**: 前のフレームをベース画像として使用
2. **差分検出**: ピクセル値を比較して変化した領域を特定
3. **バウンディングボックス最適化**: 重複領域をマージし矩形を最適化
4. **閾値判定**: 変化が閾値を超えた場合はキーフレームにフォールバック

### 1.3 最適化技術

#### 矩形マージ
```typescript
// 重複する矩形をマージしてオーバーヘッドを削減
const mergedBoxes = mergeOverlapBoundingBox(
  shrinkOverlapBoundingBox(diffBox)
);
```

#### サイズ閾値
```typescript
// 変化が広範囲すぎる場合はキーフレームを使用
if (mergedBoundingBoxes[0].area === currentImage.rect.width * currentImage.rect.height) {
  // クロップではなくマスターファイルとして保存
}
```

## 2. オフセット座標系

EIA v1 において `s` という名前のフィールドは複数の座標系で使われます。エンコーダ・デコーダの実装で最もバグが発生しやすい箇所です。

### 2.1 ファイルレベルの `s`（圧縮空間）

`EIAFileV1Master.s`、`EIAFileV1Cropped.s`、`EIAAnimationFrameRef*.s` はすべて**圧縮済みバイト単位**で `$` 直後を起点とするオフセットです。

```typescript
// エンコーダ側: bufferLength は圧縮ブロックを追加するごとに加算
let bufferLength = 0;

const compressed = lz4.compress(rawData);
files.push({ s: bufferLength, l: compressed.length, u: rawData.length, ... });
bufferLength += compressed.length; // 次のファイルは compressed.length バイト後から始まる
```

### 2.2 クロップパーツの `s`（非圧縮空間）

`EIAFileV1CroppedPart.s` は**非圧縮バイト単位**でそのファイルの展開バッファ先頭を起点とするオフセットです。最初のパーツは常に `s = 0` です。

```typescript
// エンコーダ側: fileBufferLength は各パーツのバッファを連結するごとに加算
let fileBufferLength = 0;

for (const rect of rects) {
  parts.push({ s: fileBufferLength, l: rect.buffer.length, ... });
  fileBuffer.push(rect.buffer);
  fileBufferLength += rect.buffer.length; // 0, size0, size0+size1, ...
}

const mergedBuffer = Buffer.concat(fileBuffer);
const compressed = lz4.compress(mergedBuffer);
// file.s = bufferLength（圧縮空間）, file.u = mergedBuffer.length（非圧縮）
// part[i].s はこの mergedBuffer 内のオフセット
```

### 2.3 デコーダ実装上の注意

```
誤り: rectOffset = rect.s - file.s    // ← file.s（圧縮空間）を引いてしまう
正解: rectOffset = rect.s             // ← rect.s はすでに展開バッファ内オフセット
```

クロップファイルのデコード手順：

```typescript
// 1. 圧縮ブロックを読み取る（file.s は圧縮空間オフセット）
const compressedBlock = dataSection.slice(file.s, file.s + file.l);

// 2. LZ4展開
const decompressed = lz4.decompress(compressedBlock, file.u);
// decompressed は file.u バイト。part[i].s はこの中のオフセット。

// 3. 各パーツを適用（rect.s は展開バッファ内オフセット）
for (const part of file.r) {
  const partData = decompressed.slice(part.s, part.s + part.l);
  // baseImage の (part.x, part.y) に part.w × part.h ピクセルを書き込む
}
```

## 3. ファイルサイズ管理

### 3.1 チャンク戦略

大きなデータセットは自動的に複数ファイルに分割されます：

```typescript
const FileSizeLimit = 95 * 1024 * 1024; // ファイルあたり95MB

// 圧縮後サイズが上限を超えた場合、より多くの分割数で再試行
if (compressedPart.length > FileSizeLimit) {
  return compressEIAv1(data, signage, count + 1, stepSize, animationMap);
}
```

### 3.2 サイズ推定

異なるシナリオの圧縮率推定を提供：
- **静的コンテンツ**: 0.1-0.2倍（90-80%削減）
- **スライドプレゼンテーション**: 0.2-0.4倍（80-60%削減）
- **動画コンテンツ**: 0.4-0.8倍（60-20%削減）

## 4. アニメーション実装

### 4.1 エンコード

アニメーションフレームはすべてのスライドデータの後にデータセクションへ追加され、スロット定義はマスターファイルの拡張オブジェクト（`e.a`）にJSON文字列として格納されます。

```typescript
// アニメーションフレームの圧縮（クロップフレームの例）
let fileBufferLength = 0;
const fileBuffer: Buffer[] = [];
const parts: EIAFileV1CroppedPart[] = [];

for (const rect of frame.cropped.rects) {
  fileBuffer.push(rect.buffer);
  parts.push({
    s: fileBufferLength,      // 展開バッファ内オフセット（0始まり）
    l: rect.buffer.length,    // 非圧縮バイト長
    x: rect.x, y: rect.y, w: rect.width, h: rect.height,
  });
  fileBufferLength += rect.buffer.length;
}

const mergedBuffer = Buffer.concat(fileBuffer);
const compressed = lz4.compress(mergedBuffer);

frameRefs.push({
  t: "c",
  s: bufferLength,            // データセクション内の圧縮空間オフセット
  l: compressed.length,
  u: mergedBuffer.length,
  r: parts,                   // parts[i].s は展開バッファ内オフセット
  b: frame.cropped.baseIndex,
});
bufferLength += compressed.length;
```

### 4.2 デコード

```typescript
// フレームインデックス計算
const frameIndex = Math.floor((Time.now - startTime) * fps) % frameCount;

// マスターフレーム
if (frame.t === "m") {
  const compressed = dataSection.slice(frame.s, frame.s + frame.l);
  frameData = lz4.decompress(compressed, frame.u);
}

// クロップ（デルタ）フレーム（疑似コード）
// 参考実装: src/lib/slidePreview/decodeEIAv1.ts のモジュール内関数 `applyRects`
if (frame.t === "c") {
  const compressed = dataSection.slice(frame.s, frame.s + frame.l);
  const delta = lz4.decompress(compressed, frame.u);
  // baseFrameData をコピーし、frame.r の各パーツを delta バッファから上書き合成する。
  // part.s は delta バッファ内のオフセット（圧縮空間ではない）。
  // fw / format はアニメーションスロットの fw（フレーム幅）/ f（テクスチャフォーマット）。
  frameData = applyRects(baseFrameData, delta, frame.r, fw, format);
}
```

### 4.3 フレームサイズ拡張

アニメーションフレームの格納サイズ（`fw`/`fh`）が表示スロットサイズ（`w`/`h`）と異なる場合は、スロットメタデータに `fw`/`fh` を含め、マニフェストの `f` 配列に `"Feature:animation-frame-size"` を追加しなければなりません（MUST）。`manifest.v` は常に `1` です。

## 5. フォーマット互換性

### 5.1 サポートされるテクスチャフォーマット

| フォーマット | バイト/ピクセル | 用途 |
|-------------|----------------|------|
| RGB24       | 3              | 標準画像 |
| RGBA32      | 4              | アルファ付き画像 |

## 6. パフォーマンス特性

### 6.1 圧縮パフォーマンス

スライドプレゼンテーションの典型的な圧縮結果：

```
入力サイズ: 50画像 × 1920×1080 × 3バイト = 約311MB
EIA v1出力: 約20-60MB（80-94%削減）
処理時間: 2-5秒（コンテンツの複雑さに依存）
```

### 6.2 メモリ使用量

- **エンコーディング**: ピークメモリ ≈ 非圧縮サイズの2倍
- **デコーディング**: インクリメンタル、約1フレームバッファが必要
- **ランダムアクセス**: キーフレームはO(1)、差分フレームはO(k)

### 6.3 最適化ガイドライン

#### エンコーダー向け：
- シーケンス順で画像を処理
- 差分検出バッファを再利用
- LZ4圧縮操作をバッチ処理

#### デコーダー向け：
- 差分再構築のためベース画像をキャッシュ
- 大きなファイルにはストリーミング展開を使用
- UIの応答性のためプログレッシブローディングを実装

## 7. エラーハンドリングのベストプラクティス

### 7.1 検証チェックリスト

```typescript
// ヘッダー検証
if (data.slice(0, 4) !== 'EIA^') {
  throw new Error('無効なEIAヘッダー');
}

// バージョン互換性
if (manifest.v !== 1) {
  throw new Error(`サポートされていないバージョン: ${manifest.v}`);
}

// ファイルレベルの境界チェック（圧縮空間）
if (file.s + file.l > dataSection.length) {
  throw new Error('ファイルがデータセクションを超えています');
}

// パーツレベルの境界チェック（非圧縮空間）
if (part.s + part.l > file.u) {
  throw new Error('パーツが展開バッファを超えています');
}
```

### 7.2 回復戦略

- **破損したマニフェスト**: 既知の構造を使用した部分回復を試行
- **欠損ベースファイル**: 依存するクロップファイルをスキップまたは最近のキーフレームを使用
- **圧縮エラー**: 利用可能な場合は生データにフォールバック

## 8. 統合例

### 8.1 Webアプリケーション

```typescript
// ブラウザでのプログレッシブローディング
async function loadEIASequence(url: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  
  const decoder = new EIADecoder(buffer);
  const manifest = decoder.getManifest();
  
  // オンデマンドで画像をロード
  for (let i = 0; i < manifest.i.length; i++) {
    const image = await decoder.getImage(i);
    displayImage(image);
  }
}
```

### 8.2 Node.js処理

```typescript
// バッチ変換
import { compressEIAv1 } from './lib/eia/compressEIAv1';

async function convertSlides(inputFiles: string[]) {
  const selectedFiles = await loadImages(inputFiles);
  const compressed = await selectedFiles2EIAv1RGB24Cropped(selectedFiles);
  
  // 結果を保存
  compressed.forEach((buffer, index) => {
    fs.writeFileSync(`output_${index}.eia`, buffer);
  });
}
```

## 9. 移行ガイド

### 9.1 TextZip v1からの移行

EIA v1は画像シーケンスでより良い圧縮を提供：

| 機能 | TextZip v1 | EIA v1 |
|------|------------|--------|
| コンテナ | ZIP | バイナリ |
| 圧縮 | ファイル単位 | 差分 + LZ4 |
| ランダムアクセス | 良好 | 優秀 |
| サイズ効率 | 良好 | 優秀 |

### 9.2 移行手順

1. **評価**: 既存のTextZipファイルのクロップ可能性を分析
2. **変換**: 提供された移行ツールを使用
3. **検証**: 出力品質と圧縮率を比較
4. **展開**: EIA v1サポートのためクライアントアプリケーションを更新

## 10. デバッグとプロファイリング

### 10.1 診断ツール

```typescript
// 圧縮分析
function analyzeCompression(input: RawImageObjV1[], output: Buffer[]) {
  const inputSize = input.reduce((acc, img) => acc + img.buffer.length, 0);
  const outputSize = output.reduce((acc, buf) => acc + buf.length, 0);
  
  console.log(`圧縮率: ${(outputSize / inputSize * 100).toFixed(1)}%`);
  console.log(`節約容量: ${(inputSize - outputSize) / 1024 / 1024} MB`);
}
```

### 10.2 パフォーマンス監視

主要メトリクスを追跡：
- 画像あたりの**エンコーディング時間**
- コンテンツタイプ別の**圧縮率**
- **メモリ使用量**のピーク
- **差分効率**（クロップ対キーフレームの比率）

## 11. 将来の考慮事項

### 11.1 後方互換性

将来のバージョンはv1との互換性を維持すべきです（SHOULD）：
- コア構造を保持
- 機能を置き換えるのではなく拡張
- 明確な移行パスを提供

## 付録: リファレンス実装

リファレンス実装はソースコードで利用可能です：

- **エンコーダー**: `src/lib/eia/compressEIAv1.ts`
- **型定義**: `src/_types/eia/v1.ts`
- **統合**: `src/lib/selectedFiles2EIA/selectedFiles2EIAv1RGB24Cropped.ts`
- **クロップロジック**: `src/lib/crop/cropImages.ts`
