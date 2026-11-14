# MyReport · 账户积分报告

一个部署在 **Cloudflare Workers** 上的消息接收接口与中文报告网页，数据持久保存在 **Cloudflare D1**。支持 Cloudflare 连接本 GitHub 仓库后自动部署，不需要独立服务器或前端托管服务。

## 功能与数据规则

- 打开 Worker 根地址 `/`，登录后查看报告；支持邮箱关键词搜索和手动刷新。电脑端使用表格，手机竖屏自动使用账号卡片。
- 点击账号邮箱即可复制完整邮箱到剪贴板，并显示“邮箱已复制”提示；电脑表格和手机卡片均支持，键盘聚焦后按 Enter 或空格也可复制。
- `POST /api/reports` 接收报告，使用环境变量 `API_KEY` 验证密钥。`POST /` 也可使用。
- 邮箱去除首尾空白并统一为小写，作为账号唯一主键；每个邮箱**只保留最后收到的 5 份报告**。
- 历史记录按数据库接收顺序从新到旧排列；同一分钟、多次相同积分或相同报告时间的上报仍分别保存。
- 表格每行代表一个邮箱，按该邮箱**最后收到的一份报告中的 `report_time` 降序**排列；时间相同时按邮箱升序。
- `report_time` 按原值保存、显示，统一按**日本时间（JST / UTC+9）**解读，用于最近24小时的状态判断。请让上报端发送日本时间。
- 不足 5 份时，空缺位置显示 `—`。
- 最近总积分高于前一次报告的积分（历史总积分2）时，在数字旁显示绿色向上箭头和增长差值小字，例如 `540 ↑ +20`（前一次为 `520`）。积分持平、下降或只有一份报告时不显示；电脑表格和手机卡片一致，差值支持小数。
- 顶部“管理账号”可统一显示删除入口；再次点击“完成管理”即可隐藏。确认删除后同步更新 D1 数据和页面统计。

电脑端表格完整的 11 列依次是：

```text
账号名称 | 最近总积分 | 最近报告时间 | 历史总积分2 | 历史报告时间2 |
历史总积分3 | 历史报告时间3 | 历史总积分4 | 历史报告时间4 |
历史总积分5 | 历史报告时间5
```

手机竖屏按账号显示卡片：完整邮箱、最近总积分和最近报告时间直接显示，点击“历史记录”可展开已有的第 2～5 份报告。无历史时显示“暂无历史记录”。手机端无需左右滚动，也没有固定邮箱列遮挡内容；账号顺序与电脑表格一致。

默认隐藏所有删除入口，点击顶部“管理账号”后才显示。管理状态会在搜索、清除搜索、刷新以及删除确认后的返回页面中保留；点击“完成管理”可退出管理模式。

### 最近24小时的颜色状态

电脑表格整行和手机账号卡片使用一致的浅色背景、侧边色条及文字标签。顶部图例显示当前筛选结果中各类账号的数量；页面同时显示本次更新的日本时间。

| 颜色 | 条件 |
| --- | --- |
| 绿色 | 最近报告在过去24小时内，并且这24小时内曾有积分提升；只有一份报告的新账号，只要报告在过去24小时内也标绿 |
| 黄色 | 最近报告在过去24小时内，但这24小时内没有积分提升（持平或下降） |
| 红色 | 最近报告已超过24小时，或报告时间晚于当前日本时间 |

- “24小时内”指当前时间往前24小时，边界恰好24小时时仍包含；超过后在下次刷新变色，不按日本自然日重置。
- 每次上报与该邮箱前一次收到的报告比较，积分较高就视为一次增长；增长发生时间使用本次的 `report_time`（日本时间）。前一次基准报告可以早于24小时窗口。
- 即使最近两次积分持平或下降，只要24小时内曾有一次增长，且最近报告仍在24小时内，就保持绿色。积分旁的 `↑ +差值` 仍只表示最近一次相对前一次的提升。
- 状态**只根据当前保留的最近5份报告**判断，将窗口内每份报告与它在保留记录中的前一次报告比较。若增长记录已经被五份保留规则清除，就不再用于判断；不额外保存增长事件或新增数据库表。
- 页面状态和日本时间在刷新时重新计算。

例如，先后收到某个邮箱 6 份报告，积分分别为 `100、200、300、400、500、600`，这一行会显示 `600、500、400、300、200`。如果最后一份补发报告的时间早于之前的报告，它仍会成为“最近”记录，整行也会按这份报告的时间排序。

网页和 `GET /api/reports` 都需要登录；`API_KEY` 用于保护 POST 写入接口。

## 网页登录认证

- 在 Worker 运行时环境变量中设置 **`LOGIN_USERNAME`**（登录账号）和 **`LOGIN_PASSWORD`**（登录密码）。这是一个共享的报告访问账号，可查看报告和删除邮箱账号，与上报消息里的账户邮箱无关。
- 打开 `/` 会自动进入 `/login`。输入账号和密码后即可查看报告；此前的邮箱搜索条件会保留。
- 账号和密码按原值匹配，区分大小写。未配置任一变量，或变量为空、全为空白时，报告页面和读取接口返回 `503`，不会开放匿名访问。
- 登录状态保留 **12 小时**，到期后需要重新登录。报告页右上角可点击“退出登录”。
- 修改任一登录变量并使其生效后，所有旧登录会话立即失效，需要使用新的凭据登录。
- 浏览器通过签名 Cookie 保持登录，不需要在每次刷新时输入密码。生产地址使用 HTTPS，Cookie 设置 `Secure`、`HttpOnly`、`SameSite=Strict`，且仅供当前站点使用；本机 HTTP 开发自动使用本机 Cookie。
- **POST 上报继续只验证 `API_KEY`**，不要求网页登录；网页登录状态也不能替代上报密钥。

已有部署升级时，在该 Worker 的 **Settings → Variables and Secrets** 添加 `LOGIN_USERNAME` 和 `LOGIN_PASSWORD` 并保存部署即可，不需要修改 D1 表结构。具体配置步骤如下。

## 删除邮箱账号及全部记录

1. 登录积分报告页面，点击顶部 **“管理账号”**，显示各账号的删除入口。
2. 在目标邮箱对应的行或手机卡片中点击 **“删除全部记录”**。
3. 确认页会显示完整邮箱和当前保留的报告数量；点击 **“取消”** 可返回报告，数据保持不变。
4. 点击 **“确认删除全部记录”**，Worker 会从 D1 中删除该邮箱的账号记录及其关联的全部报告。完成后返回报告页，显示删除成功，报告内容、账号数量和报告数量同步更新。邮箱搜索条件和管理模式会保留；可继续管理或点击 **“完成管理”** 隐藏删除入口。

- 删除仅影响所选邮箱，不影响其他账号；操作不可撤销。
- 删除要求有效的网页登录状态和同源确认表单，上报用的 API-Key 不能代替登录来执行删除。
- 打开或刷新确认页不会删除数据。账号已不存在时返回 `404`；数据库删除失败时整体回滚，账号和报告共同保留。
- 如果在确认页打开后又收到该邮箱的新报告，确认删除时会一并删除当时数据库中的全部报告。
- 删除后，同一邮箱再次通过 POST 上报时，会作为新账号重新建立历史记录；如果有定时上报脚本，后续上报仍会创建该邮箱。
- 使用现有的 D1 外键级联删除，不需要新增环境变量或执行额外的数据库迁移。更新并部署代码后即可使用。

## 部署：Cloudflare 连接 GitHub

### 1. 创建 D1 数据库并填写配置

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **Storage & databases → D1 SQL Database**，创建数据库，例如 `myreport-db`。
2. 复制新数据库的 **Database ID**。
3. 修改仓库中的 [`wrangler.jsonc`](wrangler.jsonc)：

   ```jsonc
   {
     "name": "myreport",
     "main": "src/index.js",
     "compatibility_date": "2026-07-01",
     "workers_dev": true,
     "keep_vars": true,
     "assets": {
       "directory": "./public",
       "run_worker_first": ["/*", "!/favicon.svg", "!/favicon.ico", "!/apple-touch-icon.png", "!/copy-email.js"]
     },
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "myreport-db",
         "database_id": "粘贴真实的 Database ID，替换全零占位符",
         "migrations_dir": "migrations"
       }
     ]
   }
   ```

4. 如果数据库名称不同，同时修改 `database_name`；绑定名保持为 **`DB`**。将修改提交到 GitHub 的 `main` 分支。可以直接在 GitHub 网页编辑这个文件。

Database ID 是资源标识，可以提交到仓库；真实 API 密钥和登录密码应放在 Cloudflare 的 Secret 中。

### 2. 连接 GitHub 并部署 Worker

1. 在 Cloudflare 控制台进入 **Workers & Pages → Create application → 导入 Git 仓库 / Connect GitHub**，创建 **Worker**。
2. 授权 Cloudflare 访问 GitHub，选择 **`jiojiojackson/MyReport`**。
3. 按以下配置填写构建设置：

   | 项目 | 值 |
   | --- | --- |
   | Worker 名称 | `myreport`，与 `wrangler.jsonc` 的 `name` 一致 |
   | 生产分支 | `main` |
   | 根目录 | 仓库根目录 `/` |
   | 构建命令 / Build command | `npm run build` |
   | 部署命令 / Deploy command | **`npm run deploy`** |
   | Node.js 版本 | 建议 `24`，最低 `22.12`；如需指定，在构建变量设置 `NODE_VERSION=24` |

4. Cloudflare 会根据 `package-lock.json` 安装开发依赖，保留默认安装行为，不要设置为只安装 production 依赖。
5. 开始部署。`npm run deploy` 会先执行 **远程 D1 迁移**，自动创建表和索引，再发布 Worker。每次后续部署只执行尚未应用的迁移。
6. 如果构建使用的 Cloudflare API token 缺少数据库权限，在该 Worker 的 **Settings → Builds → API token** 中选择或配置具备相应账号 **D1: Edit** 和 **Workers Scripts: Edit** 权限的 token，然后重试。自定义 token 的授权范围应包含当前数据库和 Worker 所在账号。

这是 Cloudflare Workers Builds 直接拉取 GitHub 的部署流程；仓库附带的 GitHub Actions 只做测试和构建检查，不负责部署，也不需要 GitHub 中配置 Cloudflare 密钥。

### 3. 设置运行时环境变量

1. 打开已经部署的 Worker，进入 **Settings → Variables and Secrets → Add**。
2. 添加以下三个运行时变量，建议类型均选择 **Secret**：

   | 名称 | 用途 | 填写内容 |
   | --- | --- | --- |
   | `API_KEY` | POST 上报鉴权 | 自己生成的足够长的随机密钥 |
   | `LOGIN_USERNAME` | 报告页登录账号 | 自己设置的查看账号，例如 `admin` |
   | `LOGIN_PASSWORD` | 报告页登录密码 | 自己设置的强密码 |

3. 保存并部署，使变量生效。不要将真实密钥、密码写入代码、`wrangler.jsonc` 或 README。登录账号也可以使用普通文本环境变量，代码同样支持。

**此处是 Worker 的运行时变量，不是 Settings → Builds 中的构建变量。** `API_KEY` 未设置或为空时，POST 接口返回 `503`；登录账号或密码未配置时，报告读取返回 `503`。两个鉴权流程相互独立。

项目设置了 `keep_vars: true`，后续 Git 部署会保留控制台配置的普通变量；已配置的 Secret 也会被保留。

### 4. 访问与后续更新

- 部署完成后，访问 Cloudflare 提供的地址，例如 `https://myreport.<你的子域>.workers.dev/`，使用设置的登录账号和密码进入表格。未收到数据时会显示“等待第一份报告”。
- 在 Worker 的 Bindings 中，可以确认 D1 绑定名为 `DB`，目标数据库与配置一致。
- 使用下面的 POST 示例发送一条报告，刷新页面检查结果。
- 后续推送到 `main` 会触发 Cloudflare 自动迁移、部署；D1 数据不会因代码部署丢失。
- 当前预览默认共用配置中的数据库。如果启用其他分支的预览并需要测试写入，请先配置独立的测试数据库和密钥。

## POST 上报方法

### 请求格式

```http
POST /api/reports
Content-Type: application/json
api-key: 你在 Cloudflare 中配置的 API_KEY
```

```json
{
  "email": "user@example.com",
  "total_points": 12345,
  "report_time": "2026-11-12 20:30"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `email` | string | 账户邮箱，最长 254 个字符；自动去掉首尾空白并转为小写 |
| `total_points` | number | 总积分，支持 0、负数和小数；必须是有限数字，绝对值不超过 `9007199254740991`；不能传数字字符串 |
| `report_time` | string | 必须为 `YYYY-MM-DD HH:mm`，24 小时制，并且是真实存在的日期、时间 |

请求体最大 **16 KiB**。一次请求只上报一份报告；重复请求也会作为新的一份接收记录保存。

### curl 示例：在请求头发送 api-key（推荐）

替换 URL 和密钥后执行：

```bash
curl --fail-with-body --request POST 'https://myreport.<你的子域>.workers.dev/api/reports' \
  --header 'Content-Type: application/json' \
  --header 'api-key: 替换为你的API_KEY' \
  --data '{
    "email": "user@example.com",
    "total_points": 12345,
    "report_time": "2026-11-12 20:30"
  }'
```

### curl 示例：在 JSON 中发送 api-key

不方便设置请求头时，可以把 `api-key` 放在 JSON 中；也兼容字段名 `api_key`：

```bash
curl --fail-with-body --request POST 'https://myreport.<你的子域>.workers.dev/api/reports' \
  --header 'Content-Type: application/json' \
  --data '{
    "api-key": "替换为你的API_KEY",
    "email": "user@example.com",
    "total_points": 12345.5,
    "report_time": "2026-11-12 20:30"
  }'
```

如果同时提供请求头和 JSON 密钥，**以 `api-key` 请求头为准**，错误的请求头不会被 JSON 中的正确密钥覆盖。密钥需要与 `API_KEY` 完全一致。密钥只用于验证，不写入数据库。

### Python 示例（仅使用标准库）

```python
import json
import os
from datetime import datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

payload = {
    "email": "user@example.com",
    "total_points": 12345,
    "report_time": datetime.now(ZoneInfo("Asia/Tokyo")).strftime("%Y-%m-%d %H:%M"),
}
request = Request(
    "https://myreport.<你的子域>.workers.dev/api/reports",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "api-key": os.environ["MYREPORT_API_KEY"],
    },
    method="POST",
)
with urlopen(request, timeout=20) as response:
    print(response.status, response.read().decode("utf-8"))
```

运行 Python 示例前，在调用方环境中设置 `MYREPORT_API_KEY`，其值与 Worker 的 `API_KEY` 相同。

### 返回结果

成功返回 HTTP **201**：

```json
{
  "success": true,
  "message": "报告已接收。",
  "data": {
    "email": "user@example.com",
    "total_points": 12345,
    "report_time": "2026-11-12 20:30"
  }
}
```

失败返回相应的 HTTP 状态码，JSON 格式为：

```json
{ "success": false, "error": "api-key 缺失或不正确。" }
```

| HTTP 状态码 | 含义 |
| --- | --- |
| `400` | JSON 格式、邮箱、积分或报告时间不符合要求 |
| `401` | 密钥缺失或不匹配；读取报告时也表示未登录或登录已过期 |
| `404` | 路径不存在 |
| `405` | 请求方法不支持 |
| `413` | 请求体超过 16 KiB |
| `415` | Content-Type 不是 application/json |
| `500` | 数据库操作失败，例如迁移尚未执行 |
| `503` | Worker 未配置 API_KEY、未绑定 DB；读取报告时也可能是未配置登录账号或密码 |

### 读取 JSON 报告

`GET /api/reports` **需要有效的网页登录 Cookie**，返回与网页相同顺序的数据，`reports[0]` 表示最后收到的一份，最多 5 项。浏览器登录后可直接打开此地址；未登录时返回 `401`，传入上报用的 API-Key 不能代替网页登录。

如果需要从命令行读取，可先登录并保存 Cookie，再查询：

```bash
curl --fail-with-body --request POST 'https://myreport.<你的子域>.workers.dev/login' \
  --cookie-jar '/tmp/myreport-cookies.txt' \
  --data-urlencode 'username=替换为LOGIN_USERNAME' \
  --data-urlencode 'password=替换为LOGIN_PASSWORD'

curl --fail-with-body 'https://myreport.<你的子域>.workers.dev/api/reports' \
  --cookie '/tmp/myreport-cookies.txt'
```

登录成功返回 `303` 并设置 Cookie；第二个请求成功后返回：

```json
{
  "success": true,
  "data": [
    {
      "email": "user@example.com",
      "reports": [
        { "total_points": 12345, "report_time": "2026-11-12 20:30" },
        { "total_points": 12000, "report_time": "2026-11-11 20:30" }
      ]
    }
  ]
}
```

## 本地开发与验证

准备 Node.js **24**（最低 `22.12`）和 npm：

```bash
git clone git@github.com:jiojiojackson/MyReport.git
cd MyReport
npm ci
cp .dev.vars.example .dev.vars
```

在 `.dev.vars` 中设置自己的本地测试值：

```dotenv
API_KEY="你的本地上报密钥"
LOGIN_USERNAME="你的本地登录账号"
LOGIN_PASSWORD="你的本地登录密码"
```

然后执行：

```bash
npm run db:migrate:local
npm run dev
```

打开终端显示的本地地址（通常为 `http://localhost:8787/`），输入本地登录账号和密码；把上报 curl 示例中的 URL 换成本地地址、密钥换成本地密钥即可测试。

- 本地 D1 由 Wrangler 模拟，保存在 `.wrangler/`；不会向线上数据库写入。只运行本地开发时可以保留全零 Database ID。
- `.dev.vars`、`.wrangler/`、`node_modules/` 和 `dist/` 都已忽略，不会提交到 GitHub。
- `npm test` 使用 Miniflare 的 Worker/D1 运行时与独立临时数据库验证登录、会话过期/篡改、退出、读取与删除权限，以及上报鉴权、校验、排序、保留 5 份、并发接收、级联删除、事务回滚及页面输出。
- `npm run build` 执行语法检查和 Wrangler dry-run 打包，不向 Cloudflare 发布。
- GitHub Actions 在 push / pull request 时执行测试与 dry-run 构建。

### 可选：从命令行部署

这与 GitHub 自动部署使用相同配置。如需手动操作：

```bash
npx wrangler login
npx wrangler d1 create myreport-db
```

如果之前已经创建数据库，跳过 create。将真实数据库信息写入 `wrangler.jsonc` 后执行：

```bash
npm run deploy
npx wrangler secret put API_KEY
npx wrangler secret put LOGIN_USERNAME
npx wrangler secret put LOGIN_PASSWORD
```

按提示分别输入上报密钥、登录账号和登录密码。`wrangler secret put` 会创建并发布带有该变量的新版本。

## 实现说明

```text
src/index.js                          Worker 路由、验证、D1 读写与排序
src/page.js                           中文报告页面与响应式样式
src/auth.js                           登录凭据验证与签名 Cookie 会话
src/report-status.js                  日本时间与24小时账号状态规则
public/                               标签页 SVG / ICO 图标及手机收藏图标
public/copy-email.js                   邮箱点击复制与操作反馈
migrations/0001_create_reports.sql     D1 表结构与索引
test/worker.test.js                    Worker / D1 集成测试
test/report-status.test.js             时区、24小时边界与状态规则测试
wrangler.jsonc                        Worker 和 D1 绑定配置
.dev.vars.example                     本地密钥配置模板
.github/workflows/ci.yml               GitHub 测试与构建检查
```

`accounts.email` 是主键，`reports.account_email` 外键关联账号。报告的自增 `id` 表示数据库接收顺序；使用 `(account_email, id DESC)` 索引查找最近 5 份。每次 POST 将创建账号、插入报告、删除第 6 份及更早的报告放在同一个 D1 `batch()` 事务中，避免并发写入后超出 5 份，也避免出错时只完成部分步骤。

登录凭据仅从 Worker 环境变量读取，不写入 D1。会话采用 Web Crypto 的 HMAC-SHA-256 签名，包含有效期和随机值，签名密钥与当前站点、登录账号和密码绑定；服务端每次读取报告都校验签名与有效期。登录与退出表单校验请求来源，登录后的跳转仅允许返回本站报告页。

删除入口为 `GET /accounts/delete?email=...`（仅展示确认），执行删除使用 `POST /accounts/delete` 的同源确认表单。删除前验证登录 Cookie、请求来源、确认字段和邮箱；通过绑定参数执行单条 `DELETE FROM accounts WHERE email = ?`，由 `ON DELETE CASCADE` 原子删除该账号的全部报告。

标签页图标沿用页头的绿色积分图表标识，所有页面共享。`public/favicon.svg` 用于现代浏览器，`favicon.ico` 包含 16px 和 32px 图标，`apple-touch-icon.png` 为 180px 手机收藏图标。Wrangler 自动部署这些静态文件；保留配置中的 `assets` 字段即可，无需额外环境变量。应用页面及接口继续由 Worker 处理。

配置与行为可参阅 Cloudflare 官方文档：[Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[D1 入门与绑定](https://developers.cloudflare.com/d1/get-started/)、[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[D1 迁移命令](https://developers.cloudflare.com/workers/wrangler/commands/d1/#d1-migrations-apply)、[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
