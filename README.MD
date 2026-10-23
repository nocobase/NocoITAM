# NocoITAM

English | [中文](README.zh-CN.md)

NocoITAM is an IT asset management system for IT teams, built on [NocoBase 3](https://www.nocobase.com). It keeps devices, accessories, consumables, components and software entitlements on one register, from purchase through assignment, loans, repairs, stocktakes and disposal; it equips joiners and recovers what leavers hold; and it checks the register against Microsoft Intune and Jamf Pro. It gives the team a set of AI agents: an assistant to talk to, and agents that review approvals and follow up the differences an MDM sync finds. Every agent works within the permissions of the person it works for, and every change it suggests waits for a person to accept it.

## Built on NocoBase 3

NocoBase 3 is an application foundation for building business software with coding agents. Its App Foundation provides the infrastructure every business application needs, so an application does not build it again. NocoITAM is a NocoBase Solution: a complete application generated from the NocoBase application template, with its own data model, services, API and pages on top of the foundation.

| From NocoBase 3                                      | What NocoITAM uses it for                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Application server, database layer and CLI           | The server, migrations and seeds, configuration, builds and deployment                          |
| Application template and UI Library                  | Layouts, routing, themes, sign-in pages, and the components every page is built from            |
| Authentication, users and API keys                   | Sign-in, the IT team's accounts and personal API keys                                           |
| Authorization (permission sets, record access rules) | The three roles, record and field permissions, page grants, and the Permission sets settings    |
| Agents plugin                                        | Asset Steward, conversations, skills, model services, usage, and ITAM's own commands for agents |
| Notification plugins                                 | The in-app inbox                                                                                |
| Scheduler                                            | The nightly MDM sync, employment status updates, daily maintenance and monthly depreciation     |
| File and i18n plugins                                | Attachments, model pictures and delivery notes, English and Chinese                             |

## Agents

All of ITAM's AI is built on the Agents plugin, and runs on the model services configured for the application (see [Configuration](#configuration)).

**Asset Steward.** A chat panel opens from every page, and past conversations stay with it. Asset Steward answers from the records the person may read, reads attached files, and knows the record the person is looking at. When something should change, it proposes a plan (assign a device, raise an order, hand a leaver's records over) that the person confirms on a card. It acts as that person and never beyond their permissions. It also does the work that needs reading or judging, where that work is done:

- fills a new purchase order from pasted text or an uploaded quote, and a new model or software product from what it knows;
- compares suppliers' quotes for an order and suggests which to take;
- reads a delivery note to receive an order against its lines (how far it may go is set on **Settings → Receiving from delivery notes**);
- chooses a joiner's equipment from stock, with its reasons, when the onboarding owner asks;
- judges a repair's fault and suggests whether to repair or replace;
- sorts a batch of devices on **MDM review**.

**Agent work.** Two agents work in the background, each started by events and switched on or off on **Agent team → Agent work**:

| Agent              | Started by                                                   | What it produces                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval assistant | A purchase order or a disposal sent for approval             | A review for the approver: what is asked and what it costs, whether stock or idle devices could serve, how such requests went before, a suggested decision and comment |
| MDM follow-up      | Each MDM sync: the nightly one, and **Sync now** in Settings | A plan for the new differences: a device whose platform user is not its holder goes to its owner, a platform record the register lacks to the asset managers           |

Their suggestions land in the person's **Inbox → AI suggestions**, where each is accepted or dismissed; nothing changes until a person decides.

**Making it yours.** The method each agent follows is a skill, edited on **Agent team → Skills** (the starting ones are in `ai/skills/`); the company's own rules (what it buys and from whom, when a device is replaced, what needs approval) are the **business guidance** on **Agent team → Business guidance**. The agents, their models and the token usage are on **Agent team → Agents**, **Models** and **Usage**.

## Other features

- **The register.** Five asset types, each with its own list and record pages: devices, tracked one by one with asset tag, serial number, holder, location, warranty and depreciation; accessories, consumables and components, tracked as quantities with a minimum level; and software entitlements — perpetual licences and subscriptions — with seats, keys, renewal dates and compliance. A category defines extra fields, which its models fill in as defaults for new devices.
- **Lifecycle.** Devices are assigned, loaned with a due date, reserved, transferred and returned; stock is issued, taken back and corrected with a reason; seats are assigned and reclaimed. Repairs have an owner who completes them, stocktakes are counted one device at a time with each difference resolved, and disposals are approved before they are carried out, with the data wipe recorded.
- **Procurement.** Purchase orders are raised, approved by a named approver, placed and received, with serial numbers pasted or scanned in.
- **Joiners and leavers.** Each department, and each position, has an onboarding kit. A joiner's card shows the device, stock and seats they would get; every joiner is planned together, counting stock, orders on their way and what leavers will hand back, and **Onboarding supply** lists what must still be bought. A leaver's belongings tab lists everything still in their name and returns it in batches, the records they own are handed over, and their sign-in is disabled on their last day.
- **MDM.** Microsoft Intune and Jamf Pro are read every night and matched to the register by serial number. **MDM review** lists what disagrees — a different user or status, a device silent too long, a platform record not on the register, a device the platform does not manage — to link, register, exempt or dismiss, and each device's page shows what its platform reports.
- **To-dos.** The risks first — warranties and subscriptions ending, over-allocated licences, stock below its minimum, devices not counted — then the team's work in columns: handovers, joiners to equip, approvals, orders to place and receive, disposals, repairs, overdue loans and stocktakes in progress, for the reader's own or the team's.
- **Inbox.** AI suggestions waiting on the reader, and the notifications: approvals, decisions, mentions, replies, stocktakes and overdue loans.
- **Comments.** Every record's history takes comments with @-mentions and files.
- **Reports.** Overview, asset ledger, distribution, costs and depreciation, IT cost per person, warranty and expiry, software compliance, repairs, stocktake results and changes; every table exports as CSV.
- **Global search.** ⌘K / Ctrl+K searches every kind of record, and hands a question to Asset Steward.
- **Import and export.** CSV on the registers and the reference data.
- **Languages.** The interface is in English or Chinese.

## Quick start

Use Node 24 or later and the pnpm version pinned in `package.json`.

```bash
pnpm install
pnpm nocobase config init
pnpm dev
```

`config init` writes `config.yml` from `config.example.yml` with a new master key under `secrets.keys`. Keep that key: what the application stores encrypted (model keys, MDM credentials) cannot be read without it. `pnpm dev` prints the address to open, `http://127.0.0.1:13000/main/` by default. Sign in with the initial administrator from `config.yml` (`nocobase` / `admin123` unless changed; change it before a real deployment).

### Demo data

A banner offers the **demo data**, imported and removed on **Settings → Demo data**, in English or Chinese: a company of about forty people, its devices, stock and licences with years of history, purchase orders, repairs, stocktakes and disposals, a leaver and two joiners, and demo Intune and Jamf platforms, so the MDM features can be tried without connecting anything. It brings IT accounts whose password is the username followed by `123`:

| Language | IT asset managers                                | IT support              | Leaver (sign-in disabled) |
| -------- | ------------------------------------------------ | ----------------------- | ------------------------- |
| English  | `daniel` (Daniel Brooks), `emily` (Emily Carter) | `ryanm` (Ryan Mitchell) | `markt` (Mark Taylor)     |
| Chinese  | `sunqiang` (孙强), `wujing` (吴静)               | `zhouyu` (周宇)         | `chenjie` (陈杰)          |

The administrator who imports it becomes an IT asset manager too, with approvals, orders, a repair and a stocktake of their own. Removing the demo data removes all of it, its accounts and its notifications.

### Roles

Only IT signs in: employees are people in the register who hold devices, seats and stock, without accounts. Accounts are created on **Settings → Users**, each with one or more roles.

| Role             | What it can do                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Administrator    | Configures ITAM, its agents and its integrations, and sees everything                              |
| IT asset manager | Everything in the register, including approving purchase orders and disposals and deleting records |
| IT support       | The same work as the asset manager, without approving or deleting                                  |

The roles can be adjusted on **Settings → Permission sets**.

## Configuration

`config.yml` holds the secrets and is not committed; `config.example.yml` documents every option. Change a value with `pnpm nocobase config set key=value`.

**Language.** `i18n.defaultLocale` (`en-US` or `zh-CN`, or `APP_DEFAULT_LOCALE`) is the language the application starts in, and the language the seeded categories, locations, departments and business guidance are written in when a database is created. Choose it before the first start.

**AI.** Declare at least one model service under `ai.llmServices` in `config.yml`, with its key written as the value itself (a `${NAME}` placeholder is not expanded; `pnpm nocobase config set --from-env ai.llmServices.deepseek.options.apiKey=DEEPSEEK_API_KEY` takes it from the environment):

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

On start, a service not yet on **Agent team → Models** is created there, and the page manages it afterwards; other providers are added on that page with their key. Asset Steward uses the services in the order of `sort`, the first as its default.

**Notifications.** The in-app inbox needs the channel `in-app` (`notification.channels.in-app: { provider: in-app }`, already in `config.example.yml`).

**MDM.** Connect Intune and Jamf Pro on **Settings → MDM**, or under `deviceSync` in `config.yml` (`INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET`, `JAMF_URL`, `JAMF_CLIENT_ID`, `JAMF_CLIENT_SECRET`), which then wins and shows read-only. Intune needs an Entra ID app registration with the Microsoft Graph application permission `DeviceManagementManagedDevices.Read.All`; Jamf Pro 10.49 or later an API client whose role holds only Read Computers and Read Mobile Devices.

**Scheduled tasks.** Four run every night and need no setup: the MDM sync at 01:30, employment status at 01:50 (joiners start on their first day, leavers leave on their last), the daily maintenance at 02:00 (renewals, lapsed reservations, overdue loans), and depreciation at 03:00 on the first of each month. Each run shows on **Settings → Scheduled tasks**; the time zone, thresholds, numbering and onboarding lead times are on **Settings → General**.

**Where it is served.** `APP_BASE_PATH` is the mount path (`/main` by default) and `APP_PUBLIC_ORIGIN` the public origin without the path. A deployment must set the origin: without it, the browser's writes are refused with `403`.

**Database.** SQLite under `storage/` by default; migrations and seeds run on start. For PostgreSQL, add `@nocobase/db-postgres` and run `pnpm nocobase config init --dialect postgres --force`.

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
