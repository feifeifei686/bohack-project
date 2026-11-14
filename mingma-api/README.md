# 明码 AI 接口服务

为家装前端提供统一需求获取 `intake`，以及需求澄清、清单草稿、方案核对和解释反馈四个兼容接口。三版需求共创已调用 `intake`，服务端负责 DeepSeek 请求与结果校验，前端不持有模型密钥。接口无状态：请求携带完整上下文，响应仅返回建议，不保存项目、不发布需求、不修改商家方案，也不发送消息。

[完整接口说明](../docs/api/README.md) · [OpenAPI 3.1](../docs/api/openapi.json) · [Postman 集合](../postman/collections/mingma-ai.postman_collection.json) · [类型客户端](client.ts)

## 启动

需要 Node.js 24 或更新版本，推荐使用仓库 `.nvmrc` 指定的 Node 24。在本目录运行：

```sh
npm ci
# 仅首次克隆且没有 .env 时执行；已有 .env 时不要覆盖。
cp .env.example .env
```

在本地 `.env` 中填写 `DEEPSEEK_API_KEY`，不要放入前端 `VITE_*` 配置、源码、请求示例或 Postman 共享变量。默认使用官方 `https://api.deepseek.com` 和 `deepseek-flash`。随后运行：

```sh
npm run build
npm start
```

默认监听 `http://127.0.0.1:5199`。`npm run dev` 可用于文件变化后自动重启。`npm run build` 执行类型检查并生成 OpenAPI 与 Postman 集合；运行时直接执行 TypeScript，无独立 JavaScript 构建目录。

```sh
curl http://127.0.0.1:5199/api/health
curl http://127.0.0.1:5199/api/openapi.json
curl -X POST http://127.0.0.1:5199/api/ai/intake \
  -H 'Content-Type: application/json' \
  --data-binary @examples/intake.json
```

第三个命令会发起一次真实模型请求。`/api/health` 只检查进程和配置，不请求模型，也不能证明账户余额充足。

## 接口

| 方法与路径 | 用途 | 示例 |
| --- | --- | --- |
| `GET /api/health` | 服务状态及密钥是否配置 | 不调用模型 |
| `GET /api/openapi.json` | 读取生成的接口契约 | 不调用模型 |
| `POST /api/ai/intake` | 多区域拆分、动态追问和四组需求草稿 | [intake.json](examples/intake.json) |
| `POST /api/ai/clarify` | 从表达中提取事实并选择下一轮问题 | [clarify.json](examples/clarify.json) |
| `POST /api/ai/requirements` | 将对话整理为待确认需求草稿 | [requirements.json](examples/requirements.json) |
| `POST /api/ai/review` | 按需求版本逐项核对方案原文 | [review.json](examples/review.json) |
| `POST /api/ai/explain` | 解释方案，起草用户待确认的反馈 | [explain.json](examples/explain.json) |

成功的 AI 响应统一为 `{ requestId, data, meta }`，`meta.requiresHumanConfirmation` 始终为 `true`。模型输出先通过结构与引用检查；字段不合法、证据引用不成立或内容不完整时，不作为正常结果返回。具体防护和错误状态见[接口说明](../docs/api/README.md)。

## 前端调用

三版 `#clarify` 已使用共享的 `mingma-lab/shared/intake-ui.ts`：表达与区域选择、动态追问、手动编辑、采纳建议和逐项确认后，显式采用到原需求清单。发布仍是下一步的用户操作。独立调用可使用 [`client.ts`](client.ts)：

```ts
import { createAiClient, AiClientError } from '../mingma-api/client.ts'

const ai = createAiClient({ baseUrl: 'http://127.0.0.1:5199' })
try {
  const result = await ai.intake({
    brief: '希望厨房好打理，客厅和走道的地面看起来连贯。',
    areas: ['厨房', '客厅', '走道'],
    answers: [],
    previousItems: [],
    mode: 'refine',
  })
  // 用 questions 渲染选择题，items 展示四组需求及各自的 pending。
  // 结果是建议；发布需求仍使用页面原有的用户确认流程。
  console.log(result.requestId, result.data.questions)
} catch (error) {
  if (error instanceof AiClientError) {
    // 提示 error.message，并保留 requestId 供排查。不要自动循环重试。
    console.warn(error.code, error.requestId)
  }
}
```

导入路径按调用文件位置调整。浏览器运行时代码不导入 Zod；类型通过服务端 schema 推导。本机部署网关和 Vite 开发配置已转发同源 `/api`。独立静态服务器需另行配置转发，不能只改变客户端地址就获得后端服务。LAN 页面可直接调用网关开放的 intake 接口，无需访问码。

## 运行配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 空 | 只存于服务端；缺少时 AI POST 返回 503 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 仅允许官方 HTTPS 地址；本地模拟有独立限制 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 发送给 DeepSeek 的模型名称 |
| `HOST` / `PORT` | `127.0.0.1` / `5199` | 默认仅本机访问 |
| `AI_TIMEOUT_MS` | `60000` | 模型等待时限，100–120000 毫秒 |
| `AI_MAX_OUTPUT_TOKENS` | `8192` | 输出上限，512–16384 |
| `AI_MAX_CONCURRENT` | `2` | 整个进程同时运行的模型请求数，1–10 |
| `AI_REQUESTS_PER_MINUTE` | `20` | 每个来源 IP 的每分钟请求上限，1–120 |
| `CORS_ORIGINS` | 见 `.env.example` | 逗号分隔的明确网页来源，不接受通配符 |
| `API_ACCESS_TOKEN` | 空 | 独立的本地服务访问令牌，不是模型 Key；设置时至少 24 字符 |

默认允许的网页来源为 `http://127.0.0.1:5188`、`http://localhost:5188`、`http://127.0.0.1:5180` 和 `http://127.0.0.1:5190`。来源必须精确匹配协议、主机与端口。

绑定非回环地址时必须设置 `API_ACCESS_TOKEN`。设置后所有 AI POST 请求需带 `Authorization: Bearer <服务访问令牌>`；健康和契约读取无需令牌，但仍检查来源。该令牌只控制本服务访问，不构成业主/商家的账号权限系统。当前接口还没有生产环境的多租户隔离和审计存储。

本机部署的 API 仍只监听回环地址。LAN 通过 5188 网关直接开放同源 intake 请求，无需访问码；其他 API 保持本机限制。网关检查私有 IPv4 来源、Host 和 Origin，后端继续限流。DeepSeek 密钥只保存在服务端。参见[本机部署说明](../docs/local-deployment.md)。

## 检查与维护

```sh
npm test
npm run build
npm run test:simulation
```

契约源文件是 [`src/schemas.ts`](src/schemas.ts) 和 [`src/intake.ts`](src/intake.ts)，输入示例在 `examples/`；[`scripts/generate-openapi.ts`](scripts/generate-openapi.ts) 生成 OpenAPI 和 Postman 集合。修改字段后重新生成，不直接手改生成文件。

`test:simulation` 需要 Postman CLI 1.70 或更新版本，自动启动真实接口和本地 DeepSeek 替身，强制使用假密钥并在结束后关闭测试进程。它不加载 `.env`、不产生真实模型用量。加 `-- --collection` 会同时运行正式 Postman 集合；本轮模拟验证为 39 个场景与 21 个集合断言。

`npm run smoke:live` 使用本地密钥运行原四接口的合成样例，会产生真实模型用量；它不替代新 intake 的页面验收，也不代表所有输入的准确率。新流程结果见[新版验证记录](../docs/intake-release-verification.json)，早期四接口记录保留在[历史验证](../docs/api/verification.json)。

Postman CLI 可运行合成样例：

```sh
# 从仓库根目录运行；先启动 API 服务。
postman collection run postman/collections/mingma-ai.postman_collection.json
```

当前集合包含五次成功模型调用和两个输入边界检查；它不是纯离线测试。实际连接模拟服务时证明的是本服务与模拟契约的兼容性；连接官方服务时才构成真实联调。模型输出会变化，成功一次不表示所有家装问题都能被正确判断。

## 当前边界

- 只处理请求中的文字；不读取用户文件路径、网页 URL、PDF、图片或 CAD。
- 原文引用只能证明文字来自输入，不证明模型推理或工程判断正确。
- 未知尺寸、现场条件和专业复核项保留；“已回应”不是施工验收通过。
- 不做价格分析，不替用户选定商家，不自动更新长期规则或训练模型。
- 请求和结果不存入数据库。使用者需要自行保存待确认草稿与版本记录。

提供商协议参考：[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。本服务使用 JSON 模式并在本地校验字段，未将 JSON 模式当作内容正确性的保证。
