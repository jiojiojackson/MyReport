# MyReport · 账户积分报告

一个部署在 **Cloudflare Workers** 上的消息接收接口与中文报告网页，数据持久保存在 **Cloudflare D1**。支持 Cloudflare 连接本 GitHub 仓库后自动部署，不需要独立服务器或前端托管服务。

## 功能与数据规则

- 打开 Worker 根地址 `/`，直接查看报告表格；支持邮箱关键词搜索、手动刷新和手机横向滚动。
- `POST /api/reports` 接收报告，使用环境变量 `API_KEY` 验证密钥。`POST /` 也可使用。
- 邮箱去除首尾空白并统一为小写，作为账号唯一主键；每个邮箱**只保留最后收到的 5 份报告**。
- 历史记录按数据库接收顺序从新到旧排列；同一分钟、多次相同积分或相同报告时间的上报仍分别保存。
- 表格每行代表一个邮箱，按该邮箱**最后收到的一份报告中的 `report_time` 降序**排列；时间相同时按邮箱升序。
- `report_time` 按原值保存、显示，不做时区转换。所有上报端应约定使用同一时区，例如北京时间。
- 不足 5 份时，空缺位置显示 `—`。

完整的 11 列依次是：

```text
账号名称 | 最近总积分 | 最近报告时间 | 历史总积分2 | 历史报告时间2 |
历史总积分3 | 历史报告时间3 | 历史总积分4 | 历史报告时间4 |
历史总积分5 | 历史报告时间5
```

例如，先后收到某个邮箱 6 份报告，积分分别为 `100、200、300、400、500、600`，这一行会显示 `600、500、400、300、200`。如果最后一份补发报告的时间早于之前的报告，它仍会成为“最近”记录，整行也会按这份报告的时间排序。

网页和 `GET /api/reports` 可直接访问；`API_KEY` 用于保护 POST 写入接口。

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

Database ID 是资源标识，可以提交到仓库；真实 API 密钥应放在 Cloudflare 的 Secret 中。

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

### 3. 设置运行时 API_KEY

1. 打开已经部署的 Worker，进入 **Settings → Variables and Secrets → Add**。
2. 类型选择 **Secret**，名称填写 **`API_KEY`**，值填写自己生成的足够长的随机密钥。
3. 保存并部署，使变量生效。不要将真实密钥写入代码、`wrangler.jsonc` 或 README。

**此处是 Worker 的运行时变量，不是 Settings → Builds 中的构建变量。** 未设置或设置为空时，POST 接口返回 `503`，不会接收消息。读取网页不需要 API_KEY。

项目设置了 `keep_vars: true`，后续 Git 部署会保留控制台配置的普通变量；已配置的 Secret 也会被保留。

### 4. 访问与后续更新

- 部署完成后，访问 Cloudflare 提供的地址，例如 `https://myreport.<你的子域>.workers.dev/`，即可看到表格。未收到数据时会显示“等待第一份报告”。
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
    "report_time": datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M"),
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
| `401` | 密钥缺失或不匹配 |
| `404` | 路径不存在 |
| `405` | 请求方法不支持 |
| `413` | 请求体超过 16 KiB |
| `415` | Content-Type 不是 application/json |
| `500` | 数据库操作失败，例如迁移尚未执行 |
| `503` | Worker 未配置 API_KEY 或未绑定 DB |

### 读取 JSON 报告

`GET /api/reports` 返回与网页相同顺序的数据，`reports[0]` 表示最后收到的一份，最多 5 项：

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

把 `.dev.vars` 的 `API_KEY` 改为本地测试密钥，然后执行：

```bash
npm run db:migrate:local
npm run dev
```

打开终端显示的本地地址（通常为 `http://localhost:8787/`）；把 curl 示例中的 URL 换成本地地址、密钥换成本地密钥即可测试。

- 本地 D1 由 Wrangler 模拟，保存在 `.wrangler/`；不会向线上数据库写入。只运行本地开发时可以保留全零 Database ID。
- `.dev.vars`、`.wrangler/`、`node_modules/` 和 `dist/` 都已忽略，不会提交到 GitHub。
- `npm test` 使用 Miniflare 的 Worker/D1 运行时与独立临时数据库验证接口、鉴权、校验、排序、保留 5 份、并发接收、事务回滚及页面输出。
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
```

按提示输入密钥。`wrangler secret put` 会创建并发布带有该密钥的新版本。

## 实现说明

```text
src/index.js                          Worker 路由、验证、D1 读写与排序
src/page.js                           中文报告页面与响应式样式
migrations/0001_create_reports.sql     D1 表结构与索引
test/worker.test.js                    Worker / D1 集成测试
wrangler.jsonc                        Worker 和 D1 绑定配置
.dev.vars.example                     本地密钥配置模板
.github/workflows/ci.yml               GitHub 测试与构建检查
```

`accounts.email` 是主键，`reports.account_email` 外键关联账号。报告的自增 `id` 表示数据库接收顺序；使用 `(account_email, id DESC)` 索引查找最近 5 份。每次 POST 将创建账号、插入报告、删除第 6 份及更早的报告放在同一个 D1 `batch()` 事务中，避免并发写入后超出 5 份，也避免出错时只完成部分步骤。

配置与行为可参阅 Cloudflare 官方文档：[Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[D1 入门与绑定](https://developers.cloudflare.com/d1/get-started/)、[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[D1 迁移命令](https://developers.cloudflare.com/workers/wrangler/commands/d1/#d1-migrations-apply)、[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
