# ImageSlide Converter

スライドをImageSlide対応フォーマット（TextZip、EIA v1）に変換するWebアプリケーションです。プレゼンテーション、PDFファイル、画像をアップロードして、TextZip形式またはEIA (Efficient Image Archive) 形式に変換できます。

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

#### TextZip v1
- **ZIPコンテナ**: 標準のZIP形式による互換性
- **複数テクスチャフォーマット**: RGB24、RGBA32、DXT1、クロップ最適化版をサポート
- **拡張メタデータ**: 注釈やクロップ情報の埋め込み対応
- **JSONマニフェスト**: 構造化されたファイル情報管理

#### TextZip v0
- **軽量フォーマット**: シンプルなZIPベースの構造
- **RGBA32専用**: 32ビットRGBAフォーマットのみサポート
- **基本メタデータ**: ファイルパスと画像サイズ情報

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
2. **ImageSlideバージョン選択**: 対象となるImageSlideのバージョンを選択
3. **フォーマット設定**: 
   - **自動選択**: 最適なフォーマットを自動判定（推奨）
   - **手動選択**: 特定のフォーマットを指定
   - **圧縮優先**: EIA v1 RGB24-croppedで最大圧縮
   - **互換性優先**: TextZip v1で幅広い対応
4. **変換実行**: 変換処理を開始（プログレスバー表示）
5. **ダウンロード**: 変換されたファイルをダウンロード

### 📋 フォーマット選択ガイド

**最高圧縮率が欲しい場合:**
- EIA v1 RGB24-cropped（推定80%削減）

**互換性を重視する場合:**
- TextZip v1 RGBA32またはRGB24

**シンプルな構造が欲しい場合:**
- TextZip v0 RGBA32

### 💡 最適化のヒント

#### **最適な圧縮を得るために**
1. **スライドプレゼンテーション**: EIA v1 RGB24-croppedが最適（80-94%削減）
2. **背景が一定の画像**: クロップ最適化版フォーマットを選択
3. **透明度が不要**: RGB24を選択してファイルサイズを削減

## サポートフォーマット仕様

### 🎯 ImageSlideバージョン対応表

| ImageSlideバージョン | サポートフォーマット |
|---------------------|---------------------|
| **v0.0.x** | TextZip v0 (RGBA32) |
| **v0.1.x** | TextZip v1 (RGBA32, RGB24) |
| **v0.2.x** | TextZip v1 (RGBA32, RGB24, DXT1) |
| **v0.3.x** | TextZip v1 RGB24-cropped, **EIA v1** RGB24-cropped |

#### **メタデータサポート**
- **note拡張**: テキスト注釈の埋め込み
- **cropped拡張**: 差分領域情報（TextZip v1、EIA v1）
- **カスタム拡張**: 将来の機能拡張に対応

## 詳細ドキュメント

### EIA v1 フォーマット仕様
本プロジェクトで開発・実装されたEIA (Efficient Image Archive) v1フォーマットの詳細については、以下のドキュメントを参照してください：

- [EIA v1 仕様書](./docs/eia-v1-specification.md) - フォーマットの正式仕様
- [EIA v1 実装ガイド](./docs/eia-v1-implementation-guide.md) - 実装者向けガイド
- [EIA v1 ドキュメント](./docs/README.md) - 概要とクイックリファレンス

### フォーマット移行ガイド
- **TextZip v0 → v1**: 複数テクスチャフォーマット対応、拡張メタデータ
- **TextZip v1 → EIA v1**: バイナリコンテナ化、圧縮率大幅向上
- **自動最適化**: 最適なフォーマットの自動選択機能

## よくある質問・トラブルシューティング

### 🔧 フォーマット選択に迷った場合
**Q: どのフォーマットを選べばいいかわからない**
- A: 「自動選択」を使用するか、EIA v1 RGB24-croppedを試してください

**Q: ファイルサイズが大きすぎる**
- A: クロップ最適化版（EIA v1 RGB24-cropped）を使用してください

**Q: 古いImageSlideバージョンで読み込めない**
- A: 対象バージョンを確認し、対応するTextZipフォーマットを選択してください

### ⚠️ 制限事項
- **ファイルサイズ制限**: 95MB（圧縮前）
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
