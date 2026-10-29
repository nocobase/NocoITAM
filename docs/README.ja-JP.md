<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>エージェントが先回りし、IT 資産はいつも整然と。</strong></p>

<p align="center">オープンソースの IT 資産管理 · NocoBase で構築</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>オンラインで試す</strong></a> · <a href="https://www.nocobase.com/ja-JP/solution-itam/">公式サイト</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <strong>日本語</strong> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM は [NocoBase](https://www.nocobase.com) で構築されたオープンソースの IT 資産管理システムです。従来の IT 資産管理ツールは、手作業で台帳を管理するものでした。NocoITAM では、エージェントが MDM との差異を整理し、新入社員の機器をそろえ、購買のたびに在庫と遊休資産を確認します。すべてのデバイス、シート、支出が記録に残ります。

https://github.com/user-attachments/assets/029e8ee4-50c3-4bd3-9eac-5ad4dfccd014

## 機能

- **購買の前にまず在庫を確認。** 発注が承認に回ると、承認アシスタントが在庫や遊休デバイスで足りるかを確かめ、過去の単価や類似の申請と比べ、承認者のために判断案とコメントを下書きします。
- **入社初日から使える。** 部署ごと、職位ごとに入社キットがあります。新入社員の準備プランは在庫、遊休シート、入荷予定の発注、退職者の返却品から選ばれ、AI が理由を添えてデバイスを選び、足りない分はワンクリックで発注を起こします。
- **退職時はすべて返却。** 退職者のデバイス、アクセサリ、シートはすべて戻るまで追跡し、担当していた記録は引き継ぎ、最終日にはサインインを無効にします。
- **MDM の差異が対応プランに。** Microsoft Intune と Jamf Pro を毎晩同期し、シリアル番号で台帳と照合します。エージェントが食い違いを仕分け、利用者が違うものはデバイスの担当者へ、未登録のデバイスは資産管理者へ、判断の難しいものは人に回します。
- **スマート登録。** 見積書、請求書、納品書を貼り付けるかドロップすると、AI が明細をモデルに対応させて発注を埋め、入荷を発注と照合し（数量、シリアル番号、保証）、修理報告書や廃棄証明書も読み取ります。新しいモデルの仕様は Web から補います。
- **3 つのエージェントと、作業の場にある AI。** どのページでも話せる資産管理エージェントは、閲覧できる記録をもとに答え、カードで確認するプランを提案します。承認アシスタントと MDM 差異フォローはバックグラウンドで動き、受け入れから修理見積もりと買い替えの比較まで、11 か所で AI が手伝います。エージェントが提案し、人が判断します。
- **ライセンスとサブスクリプションを把握。** ユーザー単位、デバイス単位、サイト、無料のいずれにも対応し、シート、キー、更新日を記録します。シートが変わるたびにコンプライアンスを計算し、超過や未使用のシートは更新前に知らせます。
- **見落としなし。** To-do はまず 14 のリスクチェック（保証やサブスクリプションの終了、未使用シート、最低在庫割れ、1 年棚卸しされていないデバイス）を示し、その後にチームの作業を列で並べます：承認、入退社、発注、修理、廃棄、棚卸し。
- **IT が持つすべてを一つの台帳に。** デバイス、アクセサリ、消耗品、コンポーネント、ソフトウェアのライセンスを、購買、受け入れ、割り当て、貸し出し、修理、棚卸し、廃棄まで、それぞれ履歴とともに管理します。10 種類のレポート、CSV のインポートとエクスポート、すべての記録を横断する検索（⌘K / Ctrl+K）。
- **カスタマイズ可能。** 標準キット、予算、承認ルールを業務ガイドに文章で書けば、すべてのエージェントがそれに従います。各エージェントの手順は編集できるスキルです。ソースは公開されているので、ほかの部分はコーディングエージェントが変更できます。
- **セルフホスト。** データは自社のサーバーに置いたまま、モデルは DeepSeek、OpenAI、Claude、Gemini、Qwen などから選べます。画面は 12 言語に対応。Apache-2.0。

## クイックスタート

まずは見てみたい方は[オンラインで試す](https://solutions.nocobase.com/itam/)：デモアカウントでログインした状態で開き、データはすべて架空のものです。

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

本番環境へのデプロイは[デプロイ](guide.md#deployment)、PostgreSQL や MySQL で動かす場合は[設定](guide.md#configuration)を参照してください。

## ライセンス

NocoITAM は NocoBase で構築され、[Apache-2.0](../LICENSE) ライセンスで公開されています。
