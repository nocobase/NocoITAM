<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agent 主动跟进，IT 资产井井有条。</strong></p>

<p align="center">开源 IT 资产管理 · 基于 NocoBase 构建</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions-cn.nocobase.com/itam/"><strong>在线体验</strong></a> · <a href="https://www.nocobase.com/zh-CN/solution-itam/">官网介绍</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <strong>简体中文</strong> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <a href="README.id-ID.md">Bahasa Indonesia</a> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM 是基于 [NocoBase](https://www.nocobase.com) 的开源 IT 资产管理系统。传统资产系统靠人维护台账。在 NocoITAM 里，Agent 整理 MDM 差异、为新人配齐设备、采购前先查库存和闲置。每台设备、每个席位、每笔开支都有据可查。

https://github.com/user-attachments/assets/7eecabd4-8088-4bb5-89be-ee224686e0a7

## 功能

- **采购前先查库存。** 采购单一提交审批，审批助手就核对库存和闲置设备能否满足，比较历史单价和同类申请，给审批人起草建议和审批意见。
- **新人第一天就能上手。** 每个部门、每个职位都有入职配置。新人的配备方案从库存、闲置席位、在途采购单和离职人员的归还中挑选，AI 挑设备并写明理由，缺的一键生成采购单。
- **离职人员物品全部归还。** 离职人员的设备、配件和席位逐项跟踪到全部收回，名下的记录交接给他人，离职当天自动停用登录账号。
- **MDM 差异变成处理方案。** 每晚同步 Microsoft Intune 和 Jamf Pro，按序列号与台账匹配。Agent 分拣不一致的地方：使用人不符的交给设备负责人，未登记的设备交给资产管理员，拿不准的留给人判断。
- **智能建档。** 粘贴或拖入报价单、发票、送货单，AI 填好采购单并把明细对应到你的型号，按采购单核对到货的数量、序列号和保修，还能读维修报告和报废证明。新建型号时，AI 联网补全规格。
- **3 个 Agent，AI 就在干活的地方。** 每个页面都能对话的资产管家，根据你有权查看的记录回答问题，提出方案由你在卡片上确认；审批助手和 MDM 差异跟进在后台工作。另有 11 处 AI 辅助，从到货验收，到根据维修报价判断修还是换。Agent 给建议，人来拍板。
- **授权与订阅心中有数。** 按用户、按设备、全站或免费授权，记录席位、密钥和续订日。席位一变就重新计算合规状态，续订前提醒超量和闲置的席位。
- **风险不漏掉。** 待办页先列出 14 项风险检查（保修和订阅到期、闲置席位、库存低于水位、一年没盘点的设备），再按列排出团队的工作：审批、入离职、采购、维修、报废和盘点。
- **IT 名下的一切都在一本台账里。** 设备、配件、耗材、组件和软件授权，从采购、到货、分配、借用、维修、盘点到处置，每条记录都有完整历史。10 张报表，CSV 导入导出，搜索覆盖所有记录（⌘K / Ctrl+K）。
- **按你的方式定制。** 用几句话把标准配置、预算和审批规则写进业务指导，每个 Agent 都照着做；每个 Agent 的工作方法是一个可以修改的技能。源码开放，其余的交给编程 Agent 来改。
- **私有部署。** 数据留在你自己的服务器上，模型自己选：DeepSeek、OpenAI、Claude、Gemini、通义千问等。界面支持 12 种语言。Apache-2.0 许可。

## 快速开始

只想先看看？[在线体验](https://solutions-cn.nocobase.com/itam/)：打开即以演示账号登录，所有数据都是虚构的。

### 1. 安装

**用编程 Agent 安装。** 最简单的方式。在要放 NocoITAM 的目录里打开 Claude Code、Codex 或 Cursor，告诉它：

```text
从 https://github.com/nocobase/NocoITAM 安装 NocoITAM 并启动，按仓库的 AGENTS.md 和 README 操作，界面和初始数据用中文。
```

**手动安装。** 需要 Node.js 24 或更高版本和 pnpm 10（`corepack enable`）。数据默认存在一个 SQLite 文件里，也可以用 PostgreSQL 和 MySQL。

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm nocobase config set i18n.defaultLocale=zh-CN
pnpm dev
```

`i18n.defaultLocale=zh-CN` 让初始的分类、地点、部门和业务指导用中文写入，币种和时区为人民币和上海，要在第一次 `pnpm dev` 之前设置。

### 2. 登录

打开 `pnpm dev` 打印的 `Local:` 地址（通常是 `http://127.0.0.1:13000/main/`），用 `nocobase` 和密码 `admin123` 登录。

### 3. 导入演示数据

页面顶部的横幅会提示导入，也可以打开 **设置 → 演示数据**。它会加入一家约四十人的公司，带有设备、库存和授权，采购单、维修、盘点和处置，以及演示用的 Intune 和 Jamf 平台；正式使用前在同一页移除。

### 4. 配置 AI 模型

在 **Agent 团队 → 模型** 里添加一个模型服务并填入密钥，比如 DeepSeek、OpenAI、Claude、Gemini 或通义千问。资产管家和各个 Agent 需要它，其他功能都不需要。

[使用指南](guide.md)（英文）介绍上手步骤、演示账号、角色、Agent、配置（AI、MDM、数据库）、部署和开发。

正式部署见[部署](guide.md#deployment)；使用 PostgreSQL 或 MySQL 见[配置](guide.md#configuration)。

## 许可证

NocoITAM 基于 NocoBase 构建，以 [Apache-2.0](../LICENSE) 许可证发布。
