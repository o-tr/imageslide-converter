# ImageSlide Converter

スライドをImageSlide対応フォーマット（EIA v1）に変換するWebアプリケーションです。プレゼンテーション、PDFファイル、画像をアップロードして、EIA (Efficient Image Archive) 形式に変換できます。

## 主な機能

### 🎯 ファイル変換
- **PDF変換**: スライドプレゼンテーションPDFを各ページごとに画像変換
- **Google Slides対応**: Google Driveから直接Google Slidesファイルをインポート
- **画像ファイル**: PNG、JPEG、JPG形式の画像ファイルに対応
- **差分エンコーディング**: フレーム間の変化を最小限に抑えた効率的な圧縮

### 🗃️ サポート出力フォーマット

#### EIA v1（Efficient Image Archive）
- **独自バイナリ形式**: 最新のVRChat環境に準拠した新しいフォーマット
- **高圧縮率**: スライドプレゼンテーションで80-94%のサイズ削減を実現
- **LZ4圧縮**: 高速な圧縮・展開処理
- **ランダムアクセス**: 全体の展開なしに任意のフレームに直接アクセス可能
- **差分エンコーディング**: フレーム間の変化部分のみを保存する最適化

#### 変換の仕組み
- **類似度グラフによる親選択**: デッキ全体から似たスライドを親に選び、キーフレームも自動で決定（固定間隔なし）
- **近ロスレス前処理**: 隣接ピクセルとの差が各チャンネル2以内なら揃えて、LZ4が使える一致を増やす（`IMAGE_NEAR_LOSSLESS_TOLERANCE`、0で無効）
- **1ファイル出力**: 変換結果は常に1ファイル。圧縮後が95MBを超える場合は分割せずエラーにします（スライド枚数または解像度を下げてください）

> 旧形式（TextZip v0 / v1）への変換は廃止しました。既にアップロード済みのファイルは引き続きプレビューできます。

### 🔐 認証とファイル管理
- **Discord OAuth**: Discordアカウントでのユーザー認証
- **ファイル保存期間**: 
  - ゲストユーザー（通常サーバー）: 7日間
  - 認証ユーザー（通常サーバー）: 30日間
  - 認証ユーザー（高可用サーバー）: 7日間
- **HA（高可用）サーバー**: より信頼性の高いサーバーへのファイル移行

### 🌐 Google Drive連携
- **Google Drive API**: ファイルの直接インポート
- **Google Slides / Drive API**: スライドを PPTX に変換して編集
- **OAuth2認証**: セキュアなGoogleアカウント連携

## 技術スタック

### フロントエンド
- **TanStack Start / Router、Vite**: React フレームワークとビルド
- **TypeScript**: 型安全な開発
- **shadcn/ui / Radix UI**: UI コンポーネント
- **Tailwind CSS**: ユーティリティファーストCSS
- **Jotai**: 状態管理

### バックエンド
- **Hono / Auth.js**: API と Discord 認証
- **Prisma**: ORM とデータベース管理
- **MySQL**: メインデータベース
- **AWS S3**: ファイルストレージ
- **Iron Session**: セッション管理

### 画像処理
- **PDF.js**: PDFレンダリング
- **Canvas API**: 画像操作とリサイズ
- **Web Workers**: バックグラウンド処理
- **Basis Universal**: テクスチャ圧縮（DXT1）
- **LZ4**: データ圧縮

### 開発ツール
- **Biome**: リンターとフォーマッター
- **Lefthook**: Git フック管理
- **pnpm**: パッケージマネージャー

## 使用方法

1. **ファイル選択**: PDFファイル、画像ファイル、またはGoogle Driveからファイルを選択
2. **解像度設定**: 出力する解像度を選択（サイズ上限を超える場合は下げてください）
3. **変換実行**: 変換処理を開始（プログレスバー表示）
4. **アップロード**: 変換されたファイルをアップロードしてURLを取得

### 💡 最適化のヒント
- スライドプレゼンテーションは差分エンコーディングにより大幅に小さくなります（80-94%削減）
- 変換後が95MBを超える場合は、解像度を下げるかスライド枚数を減らしてください

## サポートフォーマット仕様

出力は **EIA v1 RGB24-cropped**（ImageSlide v0.3.x 対応）のみです。サイネージ出力では、非標準拡張の `lz4-base64` 版も選択できます。

#### **メタデータサポート**
- **note拡張**: テキスト注釈の埋め込み
- **cropped拡張**: 差分領域情報（EIA v1）
- **カスタム拡張**: 将来の機能拡張に対応

## 詳細ドキュメント

### EIA v1 フォーマット仕様
本プロジェクトで開発・実装されたEIA (Efficient Image Archive) v1フォーマットの詳細については、以下のドキュメントを参照してください：

- [EIA v1 仕様書](./docs/eia-v1-specification.md) - フォーマットの正式仕様
- [EIA v1 実装ガイド](./docs/eia-v1-implementation-guide.md) - 実装者向けガイド
- [EIA v1 ドキュメント](./docs/README.md) - 概要とクイックリファレンス

## よくある質問・トラブルシューティング

### 🔧 変換に失敗する場合
**Q: 「変換後のサイズが上限を超えました」と表示される**
- A: 解像度を下げるか、スライド枚数を減らしてください（EIA v1 は1ファイル95MBまで）

### ⚠️ 制限事項
- **ファイルサイズ制限**: 変換後95MB（超過時はエラー）
- **対応画像形式**: PNG、JPEG、JPG
- **最大解像度**: システムメモリに依存
- **同時変換**: 1ファイルずつ処理

## セットアップ

### 前提条件
- Node.js 24.0.0以上
- pnpm
- MySQL データベース
- AWS S3 バケット
- Google Cloud Platform アカウント
- Discord Application

### 環境変数設定

```bash
# データベース
DATABASE_URL="mysql://username:password@localhost:3306/database"

# AWS S3
S3_NORMAL_BUCKET="your-normal-bucket"
S3_HA_BUCKET="your-ha-bucket"
NEXT_PUBLIC_S3_NORMAL_PUBLIC_BASE_URL="https://your-domain.com"
NEXT_PUBLIC_S3_HA_PUBLIC_BASE_URL="https://your-ha-domain.com"
S3_NORMAL_ACCESS_KEY="your-access-key"
S3_NORMAL_SECRET_KEY="your-secret-key"
S3_NORMAL_ENDPOINT="https://your-s3-endpoint"
S3_HA_ACCESS_KEY="your-ha-access-key"
S3_HA_SECRET_KEY="your-ha-secret-key"
S3_HA_ENDPOINT="https://your-ha-s3-endpoint"

# Google API
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-client-id"
NEXT_PUBLIC_GOOGLE_API_KEY="your-google-api-key"

# GIF アニメーション対応（既定: 有効）
# false にすると GIF を静止画像として書き出せます
NEXT_PUBLIC_ENABLE_GIF_ANIMATION="false"

# Discord OAuth
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"

# Auth.js とアップロード用セッション
NEXTAUTH_SECRET="your-nextauth-secret"
IRON_SESSION_PASSWORD="a-password-at-least-32-characters-long"
IRON_SESSION_COOKIE_NAME="imageslide-upload"
```

`NEXT_PUBLIC_ENABLE_GIF_ANIMATION` はブラウザ向けの設定です。変更後はサーバーを再起動してください。プロダクション環境でも再ビルドは不要です。有効時、DeckCraft は GIF を含むスライドを 10 fps のアニメーションとして書き出します。対応形式は v0.3.x の EIA v1 RGB24 (cropped) で、ループの長さは最大 10 秒です。無効時は静止画像になります。

### インストールと起動

```bash
# 依存関係のインストール
pnpm install

# データベースマイグレーション
npx prisma migrate dev

# DeckCraft をビルド（フォントカタログは別途用意）
git submodule update --init --recursive
pnpm build:deckcraft

# 開発サーバーの起動
pnpm dev
```

Vite は既定で [http://localhost:5173](http://localhost:5173) で起動します。フォントカタログの準備と Nginx の設定は [DeckCraft integration](docs/deckcraft-poc.md) を参照してください。

## 開発

### スクリプト
```bash
pnpm dev          # 開発サーバー起動
pnpm build        # プロダクションビルド
pnpm start        # プロダクションサーバー起動
pnpm lint         # Biomeリント実行
pnpm format       # コードフォーマット
pnpm check        # リントとフォーマットの総合チェック
```

### データベース操作
```bash
npx prisma migrate dev     # 開発用マイグレーション
npx prisma generate        # Prismaクライアント生成
npx prisma studio          # データベースGUI
```

## アーキテクチャ

```
src/
├── routes/                 # TanStack Router のルート
├── server.ts               # Hono API と Start のサーバーエントリ
├── app/                    # 画面と API ハンドラ
├── components/            # 共通コンポーネント
├── lib/                   # ユーティリティとヘルパー
│   ├── eia/              # EIA v1エンコーダー
│   ├── crop/             # 画像クロップロジック
│   ├── google/           # Google API連携
│   └── s3/               # AWS S3操作
├── worker/               # Web Workers
├── _types/               # TypeScript型定義
└── const/                # 定数定義
```

## ライセンス

このプロジェクトのライセンスについては、LICENSEファイルを確認してください。

## 貢献

Issue報告やプルリクエストを歓迎します。EIA v1仕様の改善提案も受け付けています。

## サポート

- VRChat対応: [ImageDeviceController](https://github.com/o-tr/jp.ootr.ImageDeviceController)
- 技術的な質問やサポートについては、Issueで報告してください
