# NocoITAM

[English](../README.MD) | 简体中文 | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | [Bahasa Indonesia](README.id-ID.md) | [Tiếng Việt](README.vi-VN.md)

NocoITAM 是基于 [NocoBase 3](https://www.nocobase.com) 的开源 IT 资产管理系统。传统资产系统靠人维护台账。在 NocoITAM 里，Agent 整理 MDM 差异、为新人配齐设备、采购前先查库存和闲置。每台设备、每个席位、每笔开支都有据可查。

https://github.com/user-attachments/assets/7eecabd4-8088-4bb5-89be-ee224686e0a7

[在线体验](https://solutions-cn.nocobase.com/itam/) · [官网介绍](https://www.nocobase.com/zh-CN/solution-itam/)

## 能做什么

- **采购前先查库存。** 采购单一提交审批，审批助手就核对库存和闲置设备能否满足，比较历史单价和同类申请，给审批人起草建议和审批意见。
- **新人第一天就能上手，离职人员物品全部归还。** 新人的入职套餐按库存和闲置席位一次配齐，缺的一键生成采购单；离职人员的设备、配件和席位逐项跟踪到全部收回，名下的记录交接给他人。
- **MDM 差异变成处理方案。** 每次与 Intune 或 Jamf Pro 同步后，Agent 分拣不一致的地方：使用人不符的交给设备负责人，未登记的设备交给资产管理员，拿不准的留给人判断。
- **IT 名下的一切都在一本台账里。** 设备、配件、耗材、组件和软件授权，从采购、到货、分配、借用、维修、盘点到处置，每条记录都有完整历史。
- **每个页面都有助手。** 资产管家根据你有权查看的记录回答问题，提出方案由你确认。报价单、发票、送货单这类单据，AI 读完后替你填好表单，你核对后保存。Agent 给建议，人来拍板。
- **规矩你定，代码你有。** 把标准配置、预算和审批规则写进业务指导，每个 Agent 都照着做；让编程 Agent 直接改 ITAM 的源码。开源、可私有部署，完全属于你。

## 快速开始

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

## 许可证

[Apache License 2.0](../LICENSE)
