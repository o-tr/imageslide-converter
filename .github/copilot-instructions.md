# プロジェクト INSTRUCTIONS

## プロジェクト概要
このリポジトリは「imageslide-converter」という名称で、画像やPDFなどのファイルをスライド形式に変換・管理するWebアプリケーションのようです。Next.js（TypeScript）、Prisma、Tailwind CSSなどのモダンな技術スタックを採用しています。

## 主なディレクトリ・ファイル構成
- `src/`：アプリケーションの主要なソースコード。`app/`（Next.jsのApp Router）、`atoms/`（Recoil等の状態管理用）、`components/`（UIコンポーネント）、`const/`（定数）、`lib/`（各種ライブラリ・ユーティリティ）、`utils/`（補助関数）、`worker/`（Web Worker関連）などに細分化。
- `prisma/`：Prismaのスキーマとマイグレーションファイル。DB設計・管理用。
- `public/`：静的ファイル（画像、WASM、公開用リソースなど）。
- `docs/`：仕様書や実装ガイドなどのドキュメント。
- `docker/`：Docker関連スクリプト。
- `package.json`：依存パッケージ・スクリプト管理。
- `next.config.mjs`：Next.jsの設定。
- `tailwind.config.ts`：Tailwind CSSの設定。
- `lefthook.yml`：Gitフックの設定。

## 技術スタック・特徴
- **Next.js（TypeScript）**：フロントエンド・バックエンド統合型Webアプリ。
- **Prisma**：DB ORM。`prisma/schema.prisma`でDBスキーマ管理。
- **Tailwind CSS**：ユーティリティファーストなCSSフレームワーク。
- **Web Worker**：`src/worker/`で画像圧縮や変換などの重い処理を非同期実行。
- **Google API連携**：Google SlidesやDriveとの連携用コードあり。
- **Docker対応**：`Dockerfile`、`docker/env-replacer.sh`などでコンテナ化可能。
- **CI/CD・品質管理**：`lefthook.yml`でコミットフック、`biome.json`でコードフォーマットやLint設定。

## 代表的な機能
- 画像・PDFファイルのアップロード、スライド変換、圧縮
- Google Slides/Drive連携
- PrismaによるDB管理
- Web Workerによる非同期処理
- Dockerによるデプロイ容易化

## 開発・運用のポイント
- Next.jsのApp Router構成（`src/app/`）
- 型定義は`src/_types/`に集約
- 各種ユーティリティ・サービスは`src/lib/`や`src/utils/`に分離
- Prismaマイグレーションは`prisma/migrations/`で管理
- 静的リソースは`public/`配下

## 参考ドキュメント
- `docs/`配下の各種Markdownファイル
- `README.md`（プロジェクト概要・セットアップ方法）

---
このファイルはプロジェクトの全体像・特徴を把握するためのガイドです。詳細な実装やAPI仕様は`docs/`や各種ソースコードを参照してください。

必要に応じてこのファイルの以下のセクションを更新してください
---
