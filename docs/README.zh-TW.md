# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | 繁體中文 | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

NocoITAM 是基於 [NocoBase 3](https://www.nocobase.com) 的開源 IT 資產管理系統。傳統資產系統靠人維護清冊。在 NocoITAM 裡，Agent 整理 MDM 差異、為新人備齊設備、採購前先查庫存和閒置。每台設備、每個席位、每筆支出都有據可查。

https://github.com/user-attachments/assets/09f70917-4811-4bf2-b3a3-f65dbbb4c999

[線上體驗](https://solutions.nocobase.com/itam/) · [官網介紹](https://www.nocobase.com/zh-TW/solution-itam/)

## 能做什麼

- **採購前先查庫存。** 採購單一送出簽核，簽核助理就核對庫存和閒置設備能否滿足，比較歷史單價和同類申請，替簽核人草擬建議和簽核意見。
- **新人第一天就能上手，離職人員物品全數歸還。** 新人的入職套組依庫存和閒置席位一次備齊，缺的一鍵產生採購單；離職人員的設備、配件和席位逐項追蹤到全部收回，名下的記錄交接給他人。
- **MDM 差異變成處理方案。** 每次與 Intune 或 Jamf Pro 同步後，Agent 分揀不一致之處：使用者不符的交給設備負責人，未登記的設備交給資產管理員，拿不準的留給人判斷。
- **IT 名下的一切都在一本清冊裡。** 設備、配件、耗材、元件和軟體授權，從採購、到貨、分配、借用、維修、盤點到處置，每筆記錄都有完整歷史。
- **每個頁面都有助理。** 資產管家根據你有權查看的記錄回答問題，提出方案由你確認。報價單、發票、送貨單這類單據，AI 讀完後替你填好表單，你核對後儲存。Agent 給建議，人來拍板。
- **規矩你定，程式碼你有。** 把標準配備、預算和簽核規則寫進業務指引，每個 Agent 都照著做；讓程式設計 Agent 直接修改 ITAM 的原始碼。開源、可自行部署，完全屬於你。

## 快速開始

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

## 授權條款

[Apache License 2.0](../LICENSE)
