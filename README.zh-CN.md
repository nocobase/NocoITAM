# NocoITAM

[English](README.MD) | 中文

NocoITAM 是面向 IT 团队的 IT 资产管理系统，基于 [NocoBase 3](https://www.nocobase.com) 构建。设备、配件、耗材、组件和软件授权都记在同一本台账里，从采购、分配、借出、维修、盘点一直到报废；新员工入职时配齐设备，员工离职时收回名下资产；台账还会和 Microsoft Intune、Jamf Pro 自动核对。它为团队配了一组 AI Agent：一个可以对话的助手，以及在后台审阅审批、跟进 MDM 同步差异的 Agent。每个 Agent 都只在它所服务的人的权限范围内工作，它建议的每一处改动都要由人确认后才生效。

## 基于 NocoBase 3 构建

NocoBase 3 是一个让编码 Agent 构建业务软件的应用底座。它的 App Foundation 提供了每个业务应用都需要的基础设施，应用不必再自己搭一遍。NocoITAM 是一个 NocoBase Solution：由 NocoBase 应用模板生成的完整应用，在底座之上有自己的数据模型、服务、API 和页面。

| 来自 NocoBase 3              | NocoITAM 用它做什么                                             |
| ---------------------------- | --------------------------------------------------------------- |
| 应用服务器、数据库层和命令行 | 服务端、迁移和种子数据、配置、构建与部署                        |
| 应用模板和 UI Library        | 布局、路由、主题、登录页，以及每个页面用到的组件                |
| 认证、用户和 API 密钥        | 登录、IT 团队的账号和个人 API 密钥                              |
| 授权（权限集、记录访问规则） | 三个角色、记录和字段权限、页面授权，以及「权限集」设置          |
| Agents 插件                  | 资产管家、对话、技能、模型服务、用量，以及 ITAM 给 Agent 的命令 |
| 通知插件                     | 站内收件箱                                                      |
| 定时任务                     | 每晚的 MDM 同步、在职状态更新、日常维护和每月折旧               |
| 文件和多语言插件             | 附件、型号图片和送货单，中文和英文界面                          |

## Agent

ITAM 的 AI 全部构建在 Agents 插件上，使用应用里配置的模型服务（见[配置](#配置)）。

**资产管家。** 每个页面都能打开对话面板，历史对话也保留在里面。资产管家根据当前用户能看到的记录回答问题，能读附件，也知道用户正在看哪条记录。需要改动时，它会给出一个方案（分配设备、发起采购、交接离职员工名下的单据），由用户在卡片上确认。它以这个用户的身份执行，不会超出其权限。需要阅读或判断的活，它也在对应的地方帮着做：

- 从粘贴的文字或上传的报价单填好新采购单，按自己的知识填好新型号或新软件产品；
- 比较一张采购单的多家报价，建议选哪家；
- 读供应商的送货单，对到采购单的行上完成入库（能做到哪一步在 **设置 → 按送货单入库** 里设定）；
- 入职负责人请求时，从库存里为新员工挑选设备，并写明理由；
- 判断维修的故障类型，建议修还是换；
- 在 **MDM 核对** 里批量整理设备。

**Agent 工作。** 有两个 Agent 在后台工作，各自由事件触发，在 **Agent 团队 → Agent 工作** 里开关：

| Agent    | 触发时机                                                | 产出                                                                                                 |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 审批助手 | 采购单或报废单提交审批                                  | 给审批人的审阅：申请了什么、花多少钱、库存或闲置设备能否顶上、以往类似申请怎么处理，附建议和审批意见 |
| MDM 跟进 | 每次 MDM 同步：每晚的定时同步，以及设置里的「立即同步」 | 新差异的处理方案：平台用户和使用人不一致的交给设备负责人，台账里没有的平台记录交给资产经理           |

它们的建议进入当事人的 **收件箱 → AI 建议**，逐条接受或忽略；人做决定之前，什么都不会改。

**按自己的方式来。** 每个 Agent 遵循的方法是一项技能，在 **Agent 团队 → 技能** 里编辑（初始技能在 `ai/skills/`）；公司自己的规则（买什么、从哪儿买、设备何时更换、哪些需要审批）写在 **Agent 团队 → 业务指导**。Agent、所用模型和 token 用量分别在 **Agent 团队 → Agent**、**模型** 和 **用量** 里。

## 其他功能

- **台账。** 五类资产，各有列表和详情页：设备逐台管理，带资产编号、序列号、使用人、位置、保修和折旧；配件、耗材和组件按数量管理，带最低库存；软件授权包括永久许可和订阅，带席位、密钥、续费日期和合规状态。分类可以定义扩展字段，型号会把它们作为新设备的默认值。
- **生命周期。** 设备可以分配、带归还日期借出、预留、转移和归还；库存可以领用、退回，并附原因调整；授权席位可以分配和回收。维修单有负责人负责完成，盘点逐台清点、逐项处理差异，报废先审批再执行，并记录数据清除。
- **采购。** 采购单发起后由指定审批人审批，然后下单、到货入库，序列号可以粘贴或扫码录入。
- **入职和离职。** 每个部门、每个岗位都可以有入职配置。新员工的卡片列出他会领到的设备、库存和授权；所有待入职员工一起统筹，计入库存、在途订单和离职员工将归还的资产，**入职供需** 列出还要采购什么。离职员工的「归属」页列出名下的一切，可以批量归还；他负责的单据交接给别人；最后一天自动停用登录。
- **MDM。** 每晚读取 Microsoft Intune 和 Jamf Pro，按序列号和台账匹配。**MDM 核对** 列出对不上的情况：使用人或状态不一致、长期未同步、平台有而台账没有、平台没纳管的设备，可以关联、补登记、豁免或忽略；每台设备的详情页也会显示平台上报的信息。
- **待办。** 先列风险：即将过保和到期的订阅、超配的授权、低于最低库存的物品、长期未盘点的设备；再按列展示团队要做的事：离职交接、入职准备、审批、待下单和待入库、待执行报废、维修、借出逾期和进行中的盘点。可以切换只看自己负责的。
- **收件箱。** 等你决定的 AI 建议，以及通知：审批、审批结果、@提及、回复、盘点和借出逾期。
- **评论。** 每条记录的动态里都可以评论、@同事、附文件。
- **报表。** 总览、资产台账、分布、成本和折旧、人均 IT 成本、保修和到期、软件合规、维修、盘点结果和变更记录，每张表都能导出 CSV。
- **全局搜索。** ⌘K / Ctrl+K 搜索所有类型的记录，也可以把问题交给资产管家。
- **导入导出。** 台账和主数据都支持 CSV 导入导出。
- **语言。** 界面支持中文和英文。

## 快速开始

使用 Node 24 或更高版本，以及 `package.json` 里锁定的 pnpm 版本。

```bash
pnpm install
pnpm nocobase config init
pnpm dev
```

`config init` 会根据 `config.example.yml` 生成 `config.yml`，并在 `secrets.keys` 下写入新的主密钥。请保管好这个密钥：应用加密保存的内容（模型密钥、MDM 凭据）没有它就读不出来。`pnpm dev` 会打印要打开的地址，默认是 `http://127.0.0.1:13000/main/`。用 `config.yml` 里的初始管理员登录（默认 `nocobase` / `admin123`，正式部署前请修改）。

### 演示数据

页面顶部的横幅会提示导入 **演示数据**，在 **设置 → 演示数据** 里导入和清除，有中文和英文两版：一家约四十人的公司，有跨越数年历史的设备、库存和授权，采购单、维修、盘点和报废，一名离职员工和两名待入职员工，还有演示用的 Intune 和 Jamf 平台，不用连接任何系统就能体验 MDM 功能。它会创建几个 IT 账号，密码是用户名加 `123`：

| 语言 | IT 资产经理                                      | IT 支持                 | 离职员工（登录已停用） |
| ---- | ------------------------------------------------ | ----------------------- | ---------------------- |
| 中文 | `sunqiang`（孙强）、`wujing`（吴静）             | `zhouyu`（周宇）        | `chenjie`（陈杰）      |
| 英文 | `daniel` (Daniel Brooks), `emily` (Emily Carter) | `ryanm` (Ryan Mitchell) | `markt` (Mark Taylor)  |

导入演示数据的管理员也会成为 IT 资产经理，并分到自己的审批、采购单、维修和盘点。清除演示数据会删掉它的全部记录、账号和通知。

### 角色

只有 IT 人员登录：员工是台账里的人员，持有设备、席位和库存，但没有账号。账号在 **设置 → 用户** 里创建，每个账号可以有一个或多个角色。

| 角色        | 能做什么                                           |
| ----------- | -------------------------------------------------- |
| 管理员      | 配置 ITAM、它的 Agent 和集成，能看到一切           |
| IT 资产经理 | 台账里的所有操作，包括审批采购单和报废单、删除记录 |
| IT 支持     | 和资产经理做同样的工作，但不能审批和删除           |

角色可以在 **设置 → 权限集** 里调整。

## 配置

`config.yml` 存放密钥，不提交到仓库；`config.example.yml` 说明了每一个选项。用 `pnpm nocobase config set key=value` 修改配置项。

**语言。** `i18n.defaultLocale`（`zh-CN` 或 `en-US`，也可以用 `APP_DEFAULT_LOCALE`）是应用启动时的语言，也是新建数据库时初始分类、位置、部门和业务指导所用的语言。请在第一次启动前选好。

**AI。** 在 `config.yml` 的 `ai.llmServices` 下至少声明一个模型服务，密钥直接写成值（`${NAME}` 占位符不会被展开；要从环境变量读取，可以运行 `pnpm nocobase config set --from-env ai.llmServices.deepseek.options.apiKey=DEEPSEEK_API_KEY`）：

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

启动时，还不在 **Agent 团队 → 模型** 里的服务会被创建出来，之后就由这个页面管理；其他服务商也可以在这个页面填上密钥添加。资产管家按 `sort` 的顺序使用这些服务，排第一的是默认模型。

**通知。** 站内收件箱需要名为 `in-app` 的通道（`notification.channels.in-app: { provider: in-app }`，`config.example.yml` 里已经有了）。

**MDM。** 在 **设置 → MDM** 里连接 Intune 和 Jamf Pro，或者写在 `config.yml` 的 `deviceSync` 下（也可以用 `INTUNE_TENANT_ID`、`INTUNE_CLIENT_ID`、`INTUNE_CLIENT_SECRET`、`JAMF_URL`、`JAMF_CLIENT_ID`、`JAMF_CLIENT_SECRET`），配置文件里的优先，页面上只读显示。Intune 需要一个 Entra ID 应用注册，带 Microsoft Graph 应用权限 `DeviceManagementManagedDevices.Read.All`；Jamf Pro 需要 10.49 或更高版本，以及一个角色只有 Read Computers 和 Read Mobile Devices 权限的 API 客户端。

**定时任务。** 每晚自动运行四个任务，无需配置：01:30 的 MDM 同步；01:50 的在职状态更新（新员工在入职当天生效，离职员工在最后一天离职）；02:00 的日常维护（续费、过期的预留、借出逾期）；每月 1 日 03:00 的折旧。每次运行都显示在 **设置 → 定时任务** 里；时区、阈值、编号规则和入职提前期在 **设置 → 通用** 里。

**访问地址。** `APP_BASE_PATH` 是挂载路径（默认 `/main`），`APP_PUBLIC_ORIGIN` 是不带路径的公开地址。部署时必须设置这个地址，否则浏览器的写操作会被 `403` 拒绝。

**数据库。** 默认使用 `storage/` 下的 SQLite，启动时会自动运行迁移和种子数据。要用 PostgreSQL，请添加 `@nocobase/db-postgres`，然后运行 `pnpm nocobase config init --dialect postgres --force`。

## 部署

为服务器构建一个部署包。它包含代码和生产依赖，不包含配置、数据库和上传的文件：

```bash
pnpm build --target linux-x64 --tar   # 生成 storage/exports/dist.tar.gz
```

- **用 NocoBase app-installer（推荐）。** 服务器需要 Node.js 24 和全局安装的 pm2。安装器会解压部署包、写入 `config.yml`、运行迁移并用 pm2 启动应用；升级前会先备份 SQLite 数据库，新版本启动失败时自动回滚。

  ```bash
  npx @nocobase/app-installer@beta install /srv/nocobase/itam --archive dist.tar.gz --origin https://itam.example.com --base-path /itam
  npx @nocobase/app-installer@beta upgrade --dir /srv/nocobase/itam --archive dist.tar.gz
  ```

- **手动部署。** 解压部署包，在 `dist/` 里运行 `pnpm nocobase config init` 和 `pnpm nocobase config check`，再用服务管理器运行 `node ./dist/server/standalone.js`；更新时保留 `dist/` 旁边的 `config.yml` 和 `storage/`。
- **Docker。** 用 `docker build -t nocoitam .` 构建，把 `config.yml` 只读挂载到 `/app/config.yml`，把一个卷挂载到 `/app/storage`，用 `-e APP_BASE_PATH=/itam` 指定路径。

放在反向代理后面时，要保留公开的主机名和协议，并转发 WebSocket 升级请求。部署后配置好 AI 密钥，并检查 `<挂载路径>/api/healthz`。升级前请备份数据库和 `storage/`。

## 开发

`AGENTS.md` 是开发这份代码的指南，适用于 Claude Code 或任何其他编码 Agent；`.agents/rules/` 是它索引的各领域规则，`docs/IMPLEMENTATION_PLAN.md` 记录了已做的决定。常用命令：

| 命令                              | 作用                                                 |
| --------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                        | 以热更新方式运行服务端和客户端                       |
| `pnpm build`                      | 构建到 `dist/`                                       |
| `pnpm start`                      | 运行构建产物                                         |
| `pnpm test`                       | 运行 `tests/` 里的测试                               |
| `pnpm typecheck`                  | 对客户端和服务端做类型检查                           |
| `pnpm lint`                       | 代码检查                                             |
| `pnpm check`                      | 以上全部，再加一次构建                               |
| `pnpm nocobase db apply`          | 不重启就应用待执行的迁移                             |
| `pnpm --silent data:reset --demo` | 在本地清空 ITAM 数据，重跑种子数据并重新生成演示数据 |
| `pnpm nocobase --help`            | 列出其他所有命令                                     |
