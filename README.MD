# NocoITAM

English | [中文](README.zh-CN.md)

NocoITAM is an IT asset management system for IT teams, built on [NocoBase 3](https://www.nocobase.com). It keeps devices, accessories, consumables, components and software entitlements on one register, from purchase through assignment, loans, repairs, stocktakes and disposal; it equips joiners and recovers what leavers hold; and it checks the register against Microsoft Intune and Jamf Pro. It gives the team a set of AI agents: an assistant to talk to, AI that reads the documents a task comes with and weighs what to do, and agents that review approvals and follow up what an MDM sync finds. Every agent works within the permissions of the person it works for, and every change it suggests waits for a person to accept it.

## Getting started

You need nothing but Node.js and pnpm to run NocoITAM on your own computer: it keeps its data in a SQLite file by default (PostgreSQL and MySQL work too), and every feature except the AI works without any account or key. Install it with a coding agent, or by hand in about ten minutes; then sign in and take the first steps.

### Install with a coding agent

The easiest way is to let a coding agent do it. Open Claude Code, Codex, Cursor or another coding agent in the folder where NocoITAM should go, and give it this:

```text
Install NocoITAM from https://github.com/nocobase/NocoITAM on this computer and start it.
Clone it into a NocoITAM folder, make sure Node.js 24 or later and pnpm 10 are available,
then follow the repository's AGENTS.md and README.
Language: English.
Database: the default, SQLite.
Start it with pnpm dev, then tell me the Local: address and how to sign in.
```

For Chinese, change the language line to `Language: Chinese`. For PostgreSQL or MySQL, change the database line to its connection, for example: `Database: PostgreSQL, host localhost, port 5432, database nocoitam, username postgres; I'll give you the password separately.`

The repository's `AGENTS.md` guides the agent, so later on you can ask the same agent to connect a model service or an MDM platform, or to change the application itself. Then go on with [Sign in](#sign-in).

### Install by hand

#### 1. Install the tools

- **Node.js 24 or later.** Check with `node -v`.
- **pnpm 10.** Install it with `npm install -g pnpm@10`, or run `corepack enable`.
- **Optional: an API key for a large-model service**, which the assistant and the AI agents need, such as DeepSeek, OpenAI, Claude, Gemini or Qwen. You add it once the application runs (see [First steps](#first-steps)).

#### 2. Get the code

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
```

#### 3. Create the configuration

```bash
pnpm nocobase config init --dialect sqlite
```

This writes the configuration file `config.yml`, whose `secrets` section holds a generated key that encrypts the model keys and MDM credentials the application saves. Keep that key: what it encrypted cannot be read without it. `config.yml` is not committed to Git. `--dialect sqlite` keeps the data in a file; to run on PostgreSQL or MySQL instead, see [Database](#configuration) under Configuration.

Before the first start, choose the language: `pnpm nocobase config set i18n.defaultLocale=zh-CN` for Chinese (English is the default). It decides the language the seeded categories, locations, departments and business guidance are written in, and the currency and time zone the application starts with (CNY and Shanghai for Chinese, USD and New York otherwise; both can be changed later on **Settings → General**).

#### 4. Start the application

```bash
pnpm dev
```

The first start creates the database, `storage/itam.sqlite`, and sets it up. When it is ready, it prints a `Local:` address, normally `http://127.0.0.1:13000/main/`. Open that address; if port 13000 is taken, the next free port is used, so always use the address it prints.

### Sign in

Sign in as the first administrator: username `nocobase` (or email `admin@nocobase.com`), password `admin123`. Once signed in, you can change the password on **Settings → Users**. There is no self-registration: the administrator creates every other account.

The interface language can be switched from the avatar menu at the top right.

### First steps

1. **Look around with the demo data.** The banner at the top offers it, or open **Settings → Demo data**, choose English or Chinese and import it (see [Demo data](#demo-data) below).
2. **Add your team.** Create accounts or send invitations on **Settings → Users**, and give each person a role (see [Roles](#roles) below). Only IT signs in; employees are people in the register, without accounts.
3. **Set up the reference data**: categories and their extra fields, models, vendors, locations, departments and onboarding kits, under **Reference data**. Or import your existing register as CSV.
4. **Connect Intune or Jamf Pro** on **Settings → MDM** when you use them (see [Configuration](#configuration)).
5. **Use the AI.** First add a model service with its key on **Agent team → Models** (DeepSeek, OpenAI, Claude, Gemini, Qwen and others all work). Then you can talk to Asset Steward from any page; describe your company's rules (what you buy and from whom, when a device is replaced, what needs approval) on **Agent team → Business guidance**; and switch the background agents on or off on **Agent team → Agent work**. Without a model, everything but the AI works.
6. **Start for real.** Remove the demo data on **Settings → Demo data**; your own records stay.

### Demo data

A banner offers the **demo data**, imported and removed on **Settings → Demo data**, in English or Chinese: a company of about forty people with offices in Shanghai and Tokyo, its devices, stock and licences with years of history, purchase orders at every stage, repairs that ended every way (some with a vendor's quote and Asset Steward's advice on it), stocktakes, disposals that were scrapped, donated, sold and turned down, a leaver and two joiners, and demo Intune and Jamf platforms, so the MDM features can be tried without connecting anything. It brings IT accounts whose password is the username followed by `123`:

| Language | IT asset managers                                | IT support              | Leaver (sign-in disabled) |
| -------- | ------------------------------------------------ | ----------------------- | ------------------------- |
| English  | `daniel` (Daniel Brooks), `emily` (Emily Carter) | `ryanm` (Ryan Mitchell) | `markt` (Mark Taylor)     |
| Chinese  | `sunqiang` (孙强), `wujing` (吴静)               | `zhouyu` (周宇)         | `chenjie` (陈杰)          |

The administrator who imports it becomes an IT asset manager too, with approvals, orders, repairs, disposals and a stocktake of their own. The demo's prices are written in yuan and converted to the register's currency when it is imported. Removing the demo data removes all of it, its accounts and its notifications.

### Roles

Accounts are created on **Settings → Users**, each with one or more roles; there is no self-registration.

| Role             | What it can do                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Administrator    | Configures ITAM, its agents and its integrations, and sees everything                              |
| IT asset manager | Everything in the register, including approving purchase orders and disposals and deleting records |
| IT support       | The same work as the asset manager, without approving or deleting                                  |

What each role may do is adjusted on **Settings → Permission sets**.

### Common problems

| What you see                                         | What to do                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` refuses to run or fails on the engine | Use Node.js 24 or later and pnpm 10 (see [Install the tools](#1-install-the-tools)).                                                                           |
| The page does not open                               | Use the `Local:` address `pnpm dev` printed, including `/main/`. Only one `pnpm dev` runs per folder; stop the other one first.                                |
| The AI buttons do not show, or the assistant is off  | No model is connected yet. Add a model service with its key on **Agent team → Models**.                                                                        |
| A document is not read                               | The AI reads text: Excel, CSV, Word and text PDFs. A photo or a scanned PDF has no text to read; type or paste what it says.                                   |
| Forgot the administrator password                    | Another administrator resets it on **Settings → Users**. On a local copy you can also start over (below) with a new password in `config.yml`.                  |
| Saved keys or MDM connections stopped working        | `config.yml` was lost or generated again. Restore the backed-up `config.yml`, or enter the keys and connect the platforms again.                               |
| You want to start over with an empty database        | Stop `pnpm dev`, delete `storage/itam.sqlite`, `storage/objects/` and `storage/ai-files/`, and start again. This deletes all local data.                       |
| You want the newest version                          | `git pull`, then `pnpm install` and `pnpm dev`. Database changes are applied when the application starts; back up `storage/` first if the data matters to you. |

## Agents

All of ITAM's AI is built on the Agents plugin, and runs on the model services configured for the application (see [Configuration](#configuration)).

**Asset Steward.** A chat panel opens from every page, and past conversations stay with it. Asset Steward answers from the records the person may read, reads attached files, and knows the record the person is looking at. When something should change, it proposes a plan (assign a device, raise an order, hand a leaver's records over) that the person confirms on a card. It acts as that person and never beyond their permissions.

**AI where the work is done.** Where a task comes with a document or a judgement, the AI does it in place, and fills the form for the person to check and save:

| Where                                | What the AI does                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| New purchase order                   | Fills the order from pasted text or an uploaded request, quote or invoice, matching its lines to the models and products on the register |
| A draft order's lines                | **Parse a document** adds the lines of a quote, an invoice or a delivery note                                                            |
| New model, software product or maker | Fills its specifications and support details, from the web when a model service that can search is connected                             |
| Receiving                            | Reads the delivery note against the order's lines: quantities, serial numbers and warranty, with what was short or extra                 |
| A joiner's equipment                 | Chooses the devices from stock, with its reasons, when the onboarding owner asks                                                         |
| New repair                           | Judges the fault, the repair method and whether to repair or replace, and offers to turn the repair into a disposal                      |
| A repair's quote                     | Reads the vendor's quote and weighs it against the device's book value, age and repairs: repair it, replace it, or check the quote first |
| Completing a repair                  | Reads the repair report or invoice: the result, the cost and what was done; warns when the document names another device                 |
| New disposal                         | Fills the reason, method and data wipe, and names the devices that should not go yet (in warranty, much value left, leased)              |
| Carrying out a disposal              | Reads the recycler's or data destruction certificate: recipient, date, amounts and wipe method, and which devices it leaves out          |
| **MDM review**                       | Sorts a batch of devices that disagree with their platform                                                                               |

Documents can be pasted, dropped or uploaded, several at a time; an uploaded file is kept on the record's attachments.

**Agent work.** Two agents work in the background, each started by events and switched on or off on **Agent team → Agent work**:

| Agent              | Started by                                                   | What it produces                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval assistant | A purchase order or a disposal sent for approval             | A review for the approver: what is asked and what it costs, whether stock or idle devices could serve, how such requests went before, a suggested decision and comment |
| MDM follow-up      | Each MDM sync: the nightly one, and **Sync now** in Settings | A plan for the new differences: a device whose platform user is not its holder goes to its owner, a platform record the register lacks to the asset managers           |

Their suggestions land in the person's **Inbox** and on the record they are about, where each is accepted or dismissed; nothing changes until a person decides.

**Making it yours.** The method each agent follows is a skill, edited on **Agent team → Skills** (the starting ones are in `ai/skills/`); the company's own rules are the **business guidance** on **Agent team → Business guidance**. The agents, their models and the token usage are on **Agent team → Agents**, **Models** and **Usage**. What the AI writes on its own follows the **AI working language** on **Settings → General** (English or Chinese); Asset Steward answers in the language it is asked in.

## Other features

- **The register.** Five asset types, each with its own list, board and record pages: devices, tracked one by one with asset tag, serial number, holder, location, warranty and depreciation; accessories, consumables and components, tracked as quantities with a minimum level; and software entitlements, perpetual licences and subscriptions, with seats, keys, renewal dates and compliance. A category defines extra fields, which its models fill in as defaults for new devices.
- **Lifecycle.** Devices are assigned, loaned with a due date, reserved, transferred and returned; stock is issued, taken back and corrected with a reason; seats are assigned and reclaimed. Each record keeps its history, with comments, @-mentions and files.
- **Procurement.** Purchase orders are raised, approved by a named approver, placed and received, with serial numbers pasted or scanned in.
- **Repairs.** A repair has an owner who records the vendor's quote, decides whether to go on or dispose of the device instead, and completes it; a repair ends repaired, unrepairable, replaced, cancelled or turned into a disposal.
- **Stocktakes and disposals.** Stocktakes are counted one device at a time with each difference resolved; disposals are approved before they are carried out, with the recipient, amounts and data wipe recorded.
- **Joiners and leavers.** Each department, and each position, has an onboarding kit. A joiner's card shows the devices, stock and seats they would get, and the orders still needed are raised from the to-dos. A leaver's belongings are returned in batches, the records they own are handed over, and their sign-in is disabled on their last day.
- **MDM.** Microsoft Intune and Jamf Pro are read every night and matched to the register by serial number. **MDM review** lists what disagrees (a different user or status, a device silent too long, a platform record not on the register, a device the platform does not manage) to link, register, exempt or dismiss, and each device's page shows what its platform reports.
- **To-dos.** The risks first (warranties and subscriptions ending, over-allocated licences, stock below its minimum, devices not counted), then the team's work in columns: approvals, staff changes, overdue loans, orders, repairs, disposals, MDM differences and stocktakes, for the reader's own or the team's.
- **Inbox.** AI suggestions waiting on the reader, and the notifications: approvals, decisions, mentions, replies, stocktakes and overdue loans.
- **Reports.** Overview, asset ledger, distribution, costs and depreciation, IT cost per person, warranty and expiry, software compliance, repairs, stocktake results and changes; every table exports as CSV.
- **Global search.** ⌘K / Ctrl+K searches every kind of record, and hands a question to Asset Steward.
- **Import and export.** CSV on the registers and the reference data.
- **Languages.** The interface, the demo data and the AI working language are in English or Chinese.

## Configuration

`config.yml` holds the secrets and is not committed; `config.example.yml` documents every option. Change a value with `pnpm nocobase config set key=value`.

**Language.** `i18n.defaultLocale` (`en-US` or `zh-CN`, or `APP_DEFAULT_LOCALE`) is the language the application starts in, and the language the seeded data is written in when a database is created, with the currency and time zone it starts with. Choose it before the first start.

**AI.** Add model services on **Agent team → Models** with their key, or declare them under `ai.llmServices` in `config.yml`, with the key written as the value itself (a `${NAME}` placeholder is not expanded; `pnpm nocobase config set --from-env ai.llmServices.deepseek.options.apiKey=DEEPSEEK_API_KEY` takes it from the environment):

```yaml
ai:
  llmServices:
    deepseek:
      title: DeepSeek
      provider: deepseek
      enabledModels:
        - label: DeepSeek V4.1 Flash
          value: deepseek-flash
      enabled: true
      sort: 10
      options:
        apiKey: <key>
```

On start, a service declared there and not yet on **Agent team → Models** is created on that page, which manages it afterwards. Asset Steward uses the services in the order of `sort`, the first as its default. Filling a model or software product from the web needs a service that can search.

**Notifications.** The in-app inbox needs the channel `in-app` (`notification.channels.in-app: { provider: in-app }`, already in `config.example.yml`).

**MDM.** Connect Intune and Jamf Pro on **Settings → MDM**, or under `deviceSync` in `config.yml` (`INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET`, `JAMF_URL`, `JAMF_CLIENT_ID`, `JAMF_CLIENT_SECRET`), which then wins and shows read-only. Intune needs an Entra ID app registration with the Microsoft Graph application permission `DeviceManagementManagedDevices.Read.All`; Jamf Pro 10.49 or later an API client whose role holds only Read Computers and Read Mobile Devices.

**Scheduled tasks.** Four run every night and need no setup: the MDM sync at 01:30, employment status at 01:50 (joiners start on their first day, leavers leave on their last), the daily maintenance at 02:00 (renewals, lapsed reservations, overdue loans), and depreciation at 03:00 on the first of each month. Each run shows on **Settings → Scheduled tasks**; the time zone, thresholds, numbering and onboarding lead times are on **Settings → General**.

**Where it is served.** `APP_BASE_PATH` is the mount path (`/main` by default) and `APP_PUBLIC_ORIGIN` the public origin without the path. A deployment must set the origin: without it, the browser's writes are refused with `403`.

**Database.** SQLite at `storage/itam.sqlite` by default; migrations and seeds run on start. NocoITAM also runs on PostgreSQL and MySQL (MariaDB uses the MySQL driver). Their drivers are installed for development and tests only, so a build carries SQLite alone; to run on one of them:

1. Move its driver into the dependencies a build carries with `pnpm add --save-prod @nocobase/db-postgres` (or `@nocobase/db-mysql`).
2. Create an empty database (for MySQL with the `utf8mb4` character set) and a user that may create tables in it.
3. Write the configuration for it with `pnpm nocobase config init --dialect postgres` (or `mysql`; add `--force` to replace an existing `config.yml`), set the connection with `pnpm nocobase config set database.connections.main.host=… database.connections.main.port=… database.connections.main.database=… database.connections.main.username=…` and its password with `pnpm nocobase config set --from-env database.connections.main.password=<variable>`, and check it with `pnpm nocobase config check`.
4. Choose the language as in [Create the configuration](#3-create-the-configuration), then start with `pnpm dev`, or build and deploy as below: the first start creates the tables.

The environment variables `DB_DIALECT`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` and `DB_PASSWORD` override `config.yml`. Changing the database does not move data: the new one starts empty, and **Settings → Demo data** can fill it. The tests run on SQLite; `NOCOBASE_TEST_DB_DIALECT=postgres` runs the database tests on a PostgreSQL server (read from `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE`, each test in a database of its own), and `NOCOBASE_TEST_DB_DIALECT=mysql` on a MySQL server (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_ADMIN_USER` and `MYSQL_ADMIN_PASSWORD`).

## Built on NocoBase 3

NocoBase 3 is an application foundation for building business software with coding agents. Its App Foundation provides the infrastructure every business application needs, so an application does not build it again. NocoITAM is a NocoBase Solution: a complete application generated from the NocoBase application template, with its own data model, services, API and pages on top of the foundation.

| From NocoBase 3                                      | What NocoITAM uses it for                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Application server, database layer and CLI           | The server, migrations and seeds, configuration, builds and deployment                                                                |
| Application template and UI Library                  | Layouts, routing, themes, sign-in pages, and the components every page is built from                                                  |
| Authentication, users and API keys                   | Sign-in, the IT team's accounts and personal API keys                                                                                 |
| Authorization (permission sets, record access rules) | The three roles, record and field permissions, page grants, and the Permission sets settings                                          |
| Agents plugin                                        | Asset Steward, conversations, skills, model services, usage, and ITAM's own commands for agents                                       |
| Notification plugins                                 | The in-app inbox                                                                                                                      |
| Lifecycle library                                    | The states and transitions of devices, purchase orders, repairs, stocktakes and disposals, and their diagrams on **Settings → Flows** |
| Scheduler                                            | The nightly MDM sync, employment status updates, daily maintenance and monthly depreciation                                           |
| File and i18n plugins                                | Attachments, model pictures and documents read by the AI, English and Chinese                                                         |
| Database Explorer                                    | Read-only browsing of the application's collections                                                                                   |

## Deployment

Build an archive for the server. It holds the code and its production dependencies, but no configuration, database or uploads:

```bash
pnpm build --target linux-x64 --tar   # writes storage/exports/dist.tar.gz
```

- **With the NocoBase app-installer (recommended).** The server needs Node.js 24 and a global pm2. The installer unpacks the archive, writes `config.yml`, applies the migrations and runs the application under pm2; an upgrade backs up the SQLite databases first and rolls back if the new release fails to start.

  ```bash
  npx @nocobase/app-installer@beta install /srv/nocobase/itam --archive dist.tar.gz --origin https://itam.example.com --base-path /itam
  npx @nocobase/app-installer@beta upgrade --dir /srv/nocobase/itam --archive dist.tar.gz
  ```

- **By hand.** Unpack the archive, run `pnpm nocobase config init` and `pnpm nocobase config check` inside `dist/`, and run `node ./dist/server/standalone.js` under a service manager, keeping `config.yml` and `storage/` beside `dist/` across updates.
- **Docker.** Build with `docker build -t nocoitam .`, mount `config.yml` read-only at `/app/config.yml` and a volume at `/app/storage`, and choose the path with `-e APP_BASE_PATH=/itam`.
- **NocoBase Studio.** A release tag (`v<version>`, on a `Release <version>` commit) runs `.github/workflows/deploy-studio.yml`, which checks and builds the release once and deploys it to the application `itam` on each configured Studio.

To serve the client's static files from a CDN, build with `CDN_BASE_URL=https://cdn.example.com/itam/v1/ pnpm build`, upload `dist/client/` there with its paths and CORS allowed for the application's origin, and keep `dist/client/` on the server too, which still serves the HTML.

Behind a reverse proxy, keep the public host and protocol and pass WebSocket upgrades. After deploying, set the AI keys and check `<base path>/api/healthz`. Back up the database and `storage/` before upgrading.

## Development

`AGENTS.md` is the guide for working on the code, with Claude Code or any other coding agent; `.agents/rules/` holds the rules for each area it indexes, and `docs/IMPLEMENTATION_PLAN.md` the decisions taken. The main commands:

| Command                           | What it does                                                         |
| --------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                        | Run the server and client with hot reload                            |
| `pnpm build`                      | Build into `dist/`                                                   |
| `pnpm start`                      | Run the build                                                        |
| `pnpm test`                       | Run the tests in `tests/`                                            |
| `pnpm typecheck`                  | Type-check the client and server                                     |
| `pnpm lint`                       | Lint                                                                 |
| `pnpm check`                      | Everything above plus a build                                        |
| `pnpm nocobase db apply`          | Apply pending migrations without restarting                          |
| `pnpm --silent data:reset --demo` | Wipe the ITAM data, re-run the seeds and regenerate the demo locally |
| `pnpm nocobase --help`            | List every other command                                             |
