<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agent 主動跟進，IT 資產井井有條。</strong></p>

<p align="center">開源 IT 資產管理 · 基於 NocoBase 建構</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>線上體驗</strong></a> · <a href="https://www.nocobase.com/zh-TW/solution-itam/">官網介紹</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>繁體中文</strong> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM 是基於 [NocoBase](https://www.nocobase.com) 的開源 IT 資產管理系統。傳統資產系統靠人維護清冊。在 NocoITAM 裡，Agent 整理 MDM 差異、為新人備齊設備、採購前先查庫存和閒置。每台設備、每個席位、每筆支出都有據可查。

https://github.com/user-attachments/assets/09f70917-4811-4bf2-b3a3-f65dbbb4c999

## 功能

- **採購前先查庫存。** 採購單一送出簽核，簽核助理就核對庫存和閒置設備能否滿足，比較歷史單價和同類申請，替簽核人草擬建議和簽核意見。
- **新人第一天就能上手。** 每個部門、每個職位都有入職套組。新人的配備方案從庫存、閒置席位、在途採購單和離職人員的歸還中挑選，AI 挑選設備並寫明理由，缺的一鍵產生採購單。
- **離職人員物品全數歸還。** 離職人員的設備、配件和席位逐項追蹤到全部收回，名下的記錄交接給他人，離職當天自動停用登入帳號。
- **MDM 差異變成處理方案。** 每晚同步 Microsoft Intune 和 Jamf Pro，依序號與清冊比對。Agent 分揀不一致之處：使用者不符的交給設備負責人，未登記的設備交給資產管理員，拿不準的留給人判斷。
- **智慧建檔。** 貼上或拖入報價單、發票、送貨單，AI 填好採購單並把明細對應到你的型號，依採購單核對到貨的數量、序號和保固，還能讀取維修報告和報廢證明。新增型號時，AI 連網補齊規格。
- **3 個 Agent，AI 就在做事的地方。** 每個頁面都能對話的資產管家，根據你有權查看的記錄回答問題，提出方案由你在卡片上確認；簽核助理和 MDM 差異跟進在背景工作。另有 11 處 AI 輔助，從到貨驗收，到依維修報價判斷修還是換。Agent 給建議，人來拍板。
- **授權與訂閱心中有數。** 依使用者、依設備、全站或免費授權，記錄席位、金鑰和續訂日。席位一變就重新計算合規狀態，續訂前提醒超量和閒置的席位。
- **風險不漏掉。** 待辦頁先列出 14 項風險檢查（保固和訂閱到期、閒置席位、庫存低於水位、一年沒盤點的設備），再按欄排出團隊的工作：簽核、入離職、採購、維修、報廢和盤點。
- **IT 名下的一切都在一本清冊裡。** 設備、配件、耗材、元件和軟體授權，從採購、到貨、分配、借用、維修、盤點到處置，每筆記錄都有完整歷史。10 張報表，CSV 匯入匯出，搜尋涵蓋所有記錄（⌘K / Ctrl+K）。
- **依你的方式客製。** 用幾句話把標準配備、預算和簽核規則寫進業務指引，每個 Agent 都照著做；每個 Agent 的工作方法是一個可以修改的技能。原始碼開放，其餘的交給程式設計 Agent 來改。
- **自行部署。** 資料留在你自己的伺服器上，模型自己選：DeepSeek、OpenAI、Claude、Gemini、通義千問等。介面支援 12 種語言。Apache-2.0 授權。

## 快速開始

只想先看看？[線上體驗](https://solutions.nocobase.com/itam/)：開啟即以示範帳號登入，所有資料都是虛構的。

### 1. 安裝

**用程式設計 Agent 安裝。** 最簡單的方式。在要放 NocoITAM 的目錄裡打開 Claude Code、Codex 或 Cursor，告訴它：

```text
從 https://github.com/nocobase/NocoITAM 安裝 NocoITAM 並啟動，依照儲存庫的 AGENTS.md 和 README 操作。
```

**手動安裝。** 需要 Node.js 24 或更新版本和 pnpm 10（`corepack enable`）。資料預設存在一個 SQLite 檔案裡，也可以用 PostgreSQL 和 MySQL。

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. 登入

打開 `pnpm dev` 印出的 `Local:` 位址（通常是 `http://127.0.0.1:13000/main/`），用 `nocobase` 和密碼 `admin123` 登入。

### 3. 匯入示範資料

頁面頂端的橫幅會提示匯入，也可以打開 **設定 → 示範資料**。它會加入一家約四十人的公司，帶有設備、庫存和授權，採購單、維修、盤點和處置，以及示範用的 Intune 和 Jamf 平台；正式使用前在同一頁移除。

### 4. 設定 AI 模型

在 **Agent 團隊 → 模型** 裡新增一個模型服務並填入金鑰，例如 DeepSeek、OpenAI、Claude、Gemini 或通義千問。資產管家和各個 Agent 需要它，其他功能都不需要。

[使用指南](guide.md)（英文）介紹後續步驟、示範帳號、角色、Agent、設定（AI、MDM、資料庫）、部署和開發。

正式部署見[部署](guide.md#deployment)；使用 PostgreSQL 或 MySQL 見[設定](guide.md#configuration)。

## 授權條款

NocoITAM 基於 NocoBase 建構，以 [Apache-2.0](../LICENSE) 授權條款發布。
