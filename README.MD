# NocoITAM

English | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [日本語](docs/README.ja-JP.md) | [한국어](docs/README.ko-KR.md) | [Deutsch](docs/README.de-DE.md) | [Français](docs/README.fr-FR.md) | [Español](docs/README.es-ES.md) | [Português](docs/README.pt-BR.md) | [Русский](docs/README.ru-RU.md) | [Bahasa Indonesia](docs/README.id-ID.md) | [Tiếng Việt](docs/README.vi-VN.md)

NocoITAM is an open-source IT asset management system built on [NocoBase 3](https://www.nocobase.com). Traditional ITAM tools are ledgers kept by hand. In NocoITAM, agents sort out MDM differences, kit out new hires, and check stock and idle assets before every purchase. Every device, seat, and dollar is on record.

https://github.com/user-attachments/assets/4f3c8bc4-bbec-4bc2-94d7-7a305c777d4a

[Try it online](https://solutions.nocobase.com/itam/) · [Website](https://www.nocobase.com/solution-itam/)

## What it does

- **Every purchase checks stock first.** When an order is sent for approval, the approval assistant checks whether stock or idle devices could cover it, compares past prices and similar requests, and drafts a decision and a comment for the approver.
- **Joiners ready on day one, leavers return everything.** A joiner's onboarding kit is matched against stock and idle seats, and the orders still needed are raised in one click. A leaver's devices, accessories and seats are tracked until all are back, and their records are handed over.
- **MDM differences become a plan.** After each Intune or Jamf Pro sync, the agent sorts what disagrees: a wrong user goes to the device's owner, an unregistered device to the asset managers, and the unclear cases to a person.
- **One register for everything IT owns.** Devices, accessories, consumables, components and software entitlements, through purchase, receiving, assignment, loans, repairs, stocktakes and disposal, each record with its history.
- **An assistant on every page.** Asset Steward answers from the records you may read and proposes plans you confirm. Where a task comes with a quote, an invoice or a delivery note, the AI reads it and fills the form for you to check. Agents suggest; people decide.
- **Your rules, your code.** Write your standard kits, budgets and approval rules as business guidance, and every agent follows it. Ask a coding agent to change ITAM's own source. Open source, self-hosted, and yours.

## Quick start

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

## License

[Apache License 2.0](LICENSE)
