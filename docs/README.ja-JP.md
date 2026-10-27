# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

NocoITAM は [NocoBase 3](https://www.nocobase.com) で構築されたオープンソースの IT 資産管理システムです。従来の IT 資産管理ツールは、手作業で台帳を管理するものでした。NocoITAM では、エージェントが MDM との差異を整理し、新入社員の機器をそろえ、購買のたびに在庫と遊休資産を確認します。すべてのデバイス、シート、支出が記録に残ります。

https://github.com/user-attachments/assets/029e8ee4-50c3-4bd3-9eac-5ad4dfccd014

[オンラインで試す](https://solutions.nocobase.com/itam/) · [公式サイト](https://www.nocobase.com/ja-JP/solution-itam/)

## できること

- **購買の前にまず在庫を確認。** 発注が承認に回ると、承認アシスタントが在庫や遊休デバイスで足りるかを確かめ、過去の単価や類似の申請と比べ、承認者のために判断案とコメントを下書きします。
- **入社初日から使える、退職時はすべて返却。** 新入社員の入社キットを在庫と遊休シートに照らして一括でそろえ、足りない分はワンクリックで発注を起こします。退職者のデバイス、アクセサリ、シートはすべて戻るまで追跡し、担当していた記録は引き継ぎます。
- **MDM の差異が対応プランに。** Intune や Jamf Pro との同期のたびに、エージェントが食い違いを仕分けます。利用者が違うものはデバイスの担当者へ、未登録のデバイスは資産管理者へ、判断の難しいものは人に回します。
- **IT が持つすべてを一つの台帳に。** デバイス、アクセサリ、消耗品、コンポーネント、ソフトウェアのライセンスを、購買、受け入れ、割り当て、貸し出し、修理、棚卸し、廃棄まで、それぞれ履歴とともに管理します。
- **どのページにもアシスタント。** 資産管理エージェントは、あなたが閲覧できる記録をもとに答え、あなたが確認するプランを提案します。見積書、請求書、納品書のような書類は AI が読み取ってフォームを埋め、あなたが確認して保存します。エージェントが提案し、人が判断します。
- **ルールもコードもあなたのもの。** 標準キット、予算、承認ルールを業務ガイドに書けば、すべてのエージェントがそれに従います。コーディングエージェントに ITAM のソースを直接変更させることもできます。オープンソースでセルフホスト、すべてあなたのものです。

## クイックスタート

### 1. インストール

**コーディングエージェントでインストール。** いちばん簡単な方法です。NocoITAM を置くフォルダで Claude Code、Codex または Cursor を開き、次のように伝えます。

```text
https://github.com/nocobase/NocoITAM から NocoITAM をインストールして起動してください。リポジトリの AGENTS.md と README に従ってください。
```

**手動でインストール。** Node.js 24 以降と pnpm 10（`corepack enable`）が必要です。データは既定で SQLite ファイルに保存されます。PostgreSQL と MySQL も使えます。

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. サインイン

`pnpm dev` が表示する `Local:` のアドレス（通常は `http://127.0.0.1:13000/main/`）を開き、`nocobase` とパスワード `admin123` でサインインします。

### 3. デモデータをインポート

画面上部のバナーから、または **設定 → デモデータ** を開いてインポートします。約 40 人の会社とそのデバイス、在庫、ライセンス、発注、修理、棚卸し、廃棄、デモ用の Intune と Jamf のプラットフォームが入ります。本番で使い始めるときは同じページで削除します。

### 4. AI モデルを設定

**エージェントチーム → モデル** で、DeepSeek、OpenAI、Claude、Gemini、Qwen などのモデルサービスをキーとともに追加します。資産管理エージェントと各エージェントに必要です。それ以外の機能はなくても動きます。

[ガイド](guide.md)（英語）では、その後の手順、デモアカウント、ロール、エージェント、設定（AI、MDM、データベース）、デプロイ、開発を説明しています。

## ライセンス

[Apache License 2.0](../LICENSE)
