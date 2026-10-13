# NocoITAM

An IT asset management system built on [NocoBase 3](https://www.nocobase.com), the open-source enterprise application development platform built for AI. It covers devices, accessories, consumables, components and software entitlements, from purchase through assignment, loans, repairs, audits and disposal. It also handles joiners and leavers: what to issue to a new employee, and what to recover from one who is leaving. The workbench lists what the team has to do next. An AI assistant answers from the records a user may see and proposes every change for the user to confirm.

## What NocoITAM does

- **The register.** Five asset types, each on its own page:
  - devices, tracked one by one, with asset tag, serial number, holder, location, warranty and depreciation;
  - accessories, consumables and components, tracked as quantities in stock with a minimum level;
  - software entitlements: perpetual licences and subscriptions, with seats, keys, renewal dates and compliance.

  Every record has a page with its timeline, attachments and the records related to it. A category defines extra fields, which models of that category fill in as defaults for new devices.

- **Lifecycle.**
  - Devices can be assigned, loaned with a due date, reserved, transferred and returned.
  - Stock is issued and taken back, and corrected with a reason.
  - Seats are assigned and reclaimed.
  - Repairs have an owner who completes them.
  - Audits are counted one device at a time, and each difference is resolved on the device.
  - Disposals go through approval before they are carried out, with the data wipe recorded.
- **Procurement.** Purchase orders are raised, approved by a named approver, placed and received in one batch. Serial numbers can be pasted or scanned in. A new order can be filled by the assistant from pasted text or an uploaded quote. An order can also be received from a delivery note the assistant reads; nothing is written until the receiver confirms.
- **Joiners and leavers.**
  - **Joiners.**
    - Each department has a standard onboarding kit, and each position can have its own.
    - A joiner's card shows which device, stock item and seat they would get, one button each.
    - Every joiner is planned together, earliest start date first. The plan counts stock, orders on their way and what leavers will hand back, and gives the last day to order anything still short.
    - **Onboarding supply** lists every joiner and what must be bought.
  - **Leavers.**
    - A leaver's belongings tab lists everything still in their name, and can return items in batches.
    - Requests they own are handed over to someone else.
    - Their sign-in is disabled on the day they leave.
- **Workbench.** The risks to look at come first: warranties and subscriptions about to end, over-allocated licences, stock below its minimum and devices not audited. Then come the team's to-dos, each with its own column: handovers, joiners to equip, approvals, orders to place and receive, disposals, repairs, overdue loans and audits in progress. A switch narrows the board to the reader's own work.
- **Reports.** The reports cover the overview, the asset ledger, distribution, costs and depreciation, IT cost per person, warranty and expiry, software compliance, repairs, audit results and changes. Every table exports as CSV.
- **Search and import.** One search covers every list, and can also hand a question to the assistant. CSV import and export work on the registers and the reference data.
- **The AI assistant, Noco.**
  - **Chat.** A chat panel on every page answers from the records the user may read, through the application's `itam` commands. Every change it proposes is one plan the user confirms on a card, carried out as that user and never beyond their permissions.
  - **Capture.** It fills a new purchase order from text or a document, and a new model or software product from what it knows.
  - **Onboarding.** It reads delivery notes for receiving. When asked, it chooses among identical devices for a joiner, giving its reasons.
  - **Skills.** How it works is written down in `ai/skills/`: catalog, receiving, onboarding and offboarding, put into the skill library on **AI → Skills** at the first start. The business notes on **Settings → System settings → AI assistant** add the company's own rules.
- **Languages.** The interface is in Chinese or English.

## Built on NocoBase 3

NocoBase 3 provides the NocoBase App Foundation, which is the application infrastructure coding agents do not need to rebuild. It also provides NocoBase Solutions: complete applications to start from. NocoITAM is one of those Solutions. It was generated from NocoBase's application template and adds its own data model, services, API and pages on top of the App Foundation, which supplies:

| From the App Foundation                    | Used by NocoITAM for                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Application server, database layer and CLI | The server, migrations, configuration, builds and deployment                                 |
| Application template and UI Library        | Layouts, routing, theme, sign-in pages and the components every page is built from           |
| Authentication, users and authorization    | Sign-in, user management, and the roles as permission sets with record and field permissions |
| Agents plugin                              | The assistant Noco, its chat panel, model services, skills and usage                         |
| Notification and scheduler plugins         | The in-app inbox and the nightly tasks: employment status, maintenance, depreciation         |
| File and i18n plugins                      | Attachments, model pictures and delivery notes, the interface languages                      |

## Quick start

Use Node 24 or later and pnpm 10 or later.

```bash
pnpm install
pnpm nocobase config init
pnpm dev
```

`config init` writes `config.yml` from `config.example.yml` with fresh secrets. `pnpm dev` prints the URL to open, which is `http://127.0.0.1:13000/main/` by default. Sign in with the initial administrator set under `users.initialAdmin` in `config.yml`. That is `nocobase` / `admin123` unless changed; change it before the first start of a real deployment.

A banner then offers the **demo data**: a sample dataset in Chinese or English, imported from **Settings → System settings → Demo data** and removable there. It comes with its own IT accounts, whose password is the username followed by `123`:

| Language | IT asset managers                                | IT support             | Leaver (sign-in disabled) |
| -------- | ------------------------------------------------ | ---------------------- | ------------------------- |
| Chinese  | `sunqiang` (孙强), `wujing` (吴静)               | `zhouyu` (周宇)        | `chenjie` (陈杰)          |
| English  | `daniel` (Daniel Brooks), `emily` (Emily Carter) | `ryan` (Ryan Mitchell) | `mark` (Mark Taylor)      |

Only IT signs in. Employees are people in the register: they hold devices, seats and stock, but they have no accounts. Other accounts are created on **Settings → Users**, each with one or more roles; there is no self-registration.

| Role             | What it can do                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Administrator    | Configures the system and sees everything                                                          |
| IT asset manager | Everything in the register, including approving purchase orders and disposals and deleting records |
| IT support       | The same work as the asset manager, without approving or deleting                                  |

The roles can be adjusted on **Settings → Permission sets**.

## Configuration

`config.yml` is gitignored because it holds the secrets; `config.example.yml` documents every option. Change a value with `pnpm nocobase config set key=value`.

**Language.** `i18n.defaultLocale` (`zh-CN` or `en-US`) is the language the application starts in. It is also the language the seeded categories, departments and business notes are written in when a new database is created. Choose it before the first start.

**Secrets.** `secrets.keys` holds the master key the application encrypts stored credentials with, the model services' keys among them; `config init` writes one. A configuration written before this needs one added (`openssl rand -hex 32`), or the assistant's model services cannot be saved:

```yaml
secrets:
  keys:
    - version: 1
      key: <64 hex characters>
```

**AI.** Declare at least one LLM service in `config.yml`, with its key written as the value itself. At the first start each becomes a model service on **AI → Model services**, and the assistant Noco is created on **AI → Agents** with every chat model, in the order of `sort`, its first the default:

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

A `${NAME}` placeholder is not expanded and would be sent as the key. To take a key from the environment, run `pnpm nocobase config set --from-env ai.llmServices.deepseek.options.apiKey=DEEPSEEK_API_KEY`. After the first start the services and Noco belong to their pages: a service or agent changed there is never overwritten from `config.yml`.

**Notifications.** In-app notifications need a channel named `in-app`:

```yaml
notification:
  channels:
    in-app:
      provider: in-app
```

**Scheduled tasks.** Three run every night and need no setup:

- updating employment status at 01:50: joiners start on their first day, leavers leave on their last;
- the daily maintenance at 02:00: renewals, lapsed reservations, overdue loans;
- depreciation at 03:00 on the first of each month.

Each run shows on **Settings → Scheduled tasks**. The time zone, thresholds, numbering and the onboarding lead times are on **Settings → System settings**.

**Where it is served.** `APP_BASE_PATH` is the mount path (`/main` by default). `app.publicOrigin`, or `APP_PUBLIC_ORIGIN`, is the public origin the browser sees: the scheme and host, without the path. A deployment must set it. Without it, the browser's writes — saving a record, importing the demo — are refused with `403`.

**Database.** SQLite is the default; migrations and seeds run on startup. For PostgreSQL, add `@nocobase/db-postgres` and run `pnpm nocobase config init --dialect postgres --force`.

## Deployment

Build an archive for the server. It holds the code and its production dependencies, but no configuration, database or uploads:

```bash
pnpm build --target linux-x64 --tar   # writes storage/exports/dist.tar.gz
```

- **On your own server, with the NocoBase app-installer (recommended).** The server needs Node.js 24 and a global pm2. The installer unpacks the archive into its own directory, writes `config.yml`, applies the migrations and runs the application under pm2. An upgrade backs up the SQLite databases first and rolls back when the new release fails to start.

  ```bash
  npx @nocobase/app-installer install /srv/nocobase/itam --archive dist.tar.gz --origin https://itam.example.com --base-path /itam
  npx @nocobase/app-installer upgrade --dir /srv/nocobase/itam --archive dist.tar.gz
  ```

- **By hand.** Unpack the archive. Inside `dist/`, run `pnpm nocobase config init` and `pnpm nocobase config check`. Then run `node ./dist/server/standalone.js` under a service manager, keeping `config.yml` and `storage/` beside `dist/` across updates.
- **Docker.** Build with `docker build -t nocoitam .`. Mount `config.yml` read-only at `/app/config.yml` and a volume at `/app/storage`, and choose the path with `-e APP_BASE_PATH=/itam`.

Behind a reverse proxy, keep the public host and protocol and pass WebSocket upgrades. After deploying, check `/<base path>/api/healthz` and set the AI keys. Back up the database and `storage/` before upgrading.

## Development

`AGENTS.md` is the guide for working on the code, with Claude Code or any other agent, and `.agents/rules/` holds the rules for each area it indexes; `docs/IMPLEMENTATION_PLAN.md` records the decisions taken. The main commands:

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
