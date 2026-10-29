<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/nocoitam-logo-dark.svg">
    <img src="docs/images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agents on it. IT assets in order.</strong></p>

<p align="center">Open-source IT asset management · Built on NocoBase</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>Try it online</strong></a> · <a href="https://www.nocobase.com/solution-itam/">Website</a>
</p>

<p align="center">
  <strong>English</strong> · <a href="docs/README.zh-CN.md">简体中文</a> · <a href="docs/README.zh-TW.md">繁體中文</a> · <a href="docs/README.ja-JP.md">日本語</a> · <a href="docs/README.ko-KR.md">한국어</a> · <a href="docs/README.de-DE.md">Deutsch</a> · <a href="docs/README.fr-FR.md">Français</a> · <a href="docs/README.es-ES.md">Español</a> · <a href="docs/README.pt-BR.md">Português</a> · <a href="docs/README.ru-RU.md">Русский</a> · <a href="docs/README.id-ID.md">Bahasa Indonesia</a> · <a href="docs/README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM is an open-source IT asset management system built on [NocoBase](https://www.nocobase.com). Traditional ITAM tools are ledgers kept by hand. In NocoITAM, agents sort out MDM differences, kit out new hires, and check stock and idle assets before every purchase. Every device, seat, and dollar is on record.

https://github.com/user-attachments/assets/4f3c8bc4-bbec-4bc2-94d7-7a305c777d4a

## Features

- **Every purchase checks stock first.** When an order is sent for approval, the approval assistant checks whether stock or idle devices could cover it, compares past prices and similar requests, and drafts a decision and a comment for the approver.
- **Joiners ready on day one.** Each department and position has an onboarding kit. A joiner's plan draws on stock, idle seats, orders on the way and leavers' returns; AI picks the devices with its reasons, and the orders still needed are raised in one click.
- **Leavers return everything.** A leaver's devices, accessories and seats are tracked until all are back, the records they own are handed over, and their sign-in is disabled on their last day.
- **MDM differences become a plan.** Microsoft Intune and Jamf Pro are synced every night and matched by serial number. The agent sorts what disagrees: a wrong user goes to the device's owner, an unregistered device to the asset managers, and the unclear cases to a person.
- **Smart capture.** Paste or drop a quote, an invoice or a delivery note: AI fills the purchase order with its lines matched to your models, checks a delivery against the order (quantities, serial numbers, warranty), and reads repair reports and disposal certificates. A new model's specifications are filled in from the web.
- **3 agents, and AI where the work is done.** Asset Steward to talk to on every page: it answers from the records you may read and proposes plans you confirm on a card. The approval assistant and MDM follow-up work in the background, and AI helps in 11 places, from receiving to weighing a repair quote against replacing the device. Agents suggest; people decide.
- **Licences and subscriptions under control.** Per user, per device, site or free, with seats, keys and renewal dates. Compliance is worked out as seats change, and over-allocated or idle seats are flagged before renewal.
- **Nothing slips.** The to-dos open with 14 risk checks (warranties and subscriptions ending, idle seats, stock below its minimum, devices not counted for a year), then the team's work in columns: approvals, joiners and leavers, orders, repairs, disposals and stocktakes.
- **One register for everything IT owns.** Devices, accessories, consumables, components and software entitlements, through purchase, receiving, assignment, loans, repairs, stocktakes and disposal, each record with its history. 10 reports, CSV import and export, and search across every record (⌘K / Ctrl+K).
- **Customizable.** Write your standard kits, budgets and approval rules as business guidance in plain text, and every agent follows it; each agent's method is a skill you can edit. The source is open, so a coding agent can change the rest.
- **Self-hosted.** Your data stays on your servers, with the models of your choice: DeepSeek, OpenAI, Claude, Gemini, Qwen and more. 12 interface languages. Apache-2.0.

## Quick start

Just want a look? [Try it online](https://solutions.nocobase.com/itam/): you're signed in to a demo account, and all the data is made up.

### 1. Install

**With a coding agent.** The easiest way. Open Claude Code, Codex or Cursor where NocoITAM should go, and give it this:

```text
Install NocoITAM from https://github.com/nocobase/NocoITAM and start it, following its AGENTS.md and README.
```

**By hand.** You need Node.js 24 or later and pnpm 10 (`corepack enable`). The data goes into a SQLite file by default; PostgreSQL and MySQL work too.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

For a register set up in Chinese, run `pnpm nocobase config set i18n.defaultLocale=zh-CN` before the first `pnpm dev`.

### 2. Sign in

Open the `Local:` address `pnpm dev` prints, normally `http://127.0.0.1:13000/main/`, and sign in as `nocobase` with the password `admin123`.

### 3. Import the demo data

The banner at the top offers it, or open **Settings → Demo data**. It brings a company of about forty people with its devices, stock and licences, orders, repairs, stocktakes and disposals, and demo Intune and Jamf platforms; remove it there when you start for real.

### 4. Set up an AI model

Add a model service with its key on **Agent team → Models**, such as DeepSeek, OpenAI, Claude, Gemini or Qwen. Asset Steward and the agents need it; everything else works without it.

The [guide](docs/guide.md) covers the first steps, the demo accounts, roles, the agents, configuration (AI, MDM, databases), deployment and development.

For production, see [Deployment](docs/guide.md#deployment); to run on PostgreSQL or MySQL, see [Configuration](docs/guide.md#configuration).

## License

NocoITAM is built on NocoBase and released under the [Apache-2.0](LICENSE) license.
