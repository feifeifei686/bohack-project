# DeepSeek 本地模拟验证

本模拟仅替代 DeepSeek HTTP 依赖，业务服务仍运行真实 `mingma-api/src/server.ts`。模型回复使用合成厨房案例，不代表模型能力测评。已验证的假设、证据与未验证范围见 [deepseek.context.yaml](deepseek.context.yaml)。

在仓库根目录运行：

```sh
node mingma-api/scripts/simulation-check.ts
```

同时执行正式 Postman 接口集合：

```sh
cd mingma-api
npm run test:simulation -- --collection
```

`--collection` 会先完成故障与成功场景（包括原有四接口和新需求获取流程），然后把依赖恢复到成功场景，再用 Postman 集合调用同一个真实 API 服务。集合的 `baseUrl` 被明确设为测试端口；API 的上游仍是本地模拟，因此不会调用真实 DeepSeek。不要用集合默认的 5199 地址替代此验证流程。

需要已安装 Node.js 24、主 API 工程依赖及支持 simulation 的 Postman CLI（本轮使用 1.79.0）。无需 Postman 登录，无需真实模型密钥；未登录，因此未搜索供应方已发布的 mock。此 mock 依据官方 HTTP 契约和本项目输出 schema 编写，没有云端部署或上传。

脚本默认使用 API 端口 5201、模拟端口 5202。两端口必须空闲；可通过 `MINGMA_TEST_API_PORT`、`MINGMA_TEST_SIM_PORT` 修改。它不会加载 `.env`，并强制将传给子进程的模型密钥替换为 `simulation-only`。模拟采用 `--port` 单端口路由，因为服务的原生 fetch 未配置 HTTP 代理；服务被显式指向 `http://127.0.0.1:5202/deepseek`，不会回退到真实服务。

完成后脚本关闭自己启动的进程，打印通过数量和临时证据目录。其中：

- `report.json` 保存各场景实际 HTTP 状态、错误码及上游调用计数。
- `simulation.ndjson` 保存模拟的 listening/request/summary 事件。
- `api.ndjson` 保存业务服务不含输入正文的请求记录。
- 使用 `--collection` 时，`collection.txt` 保存 Postman 集合输出；报告明确记录集合是否执行、退出状态，以及可可靠解析时的断言数量。

日志存放系统临时目录，不应提交 Git。首轮执行通过 19 项检查：4 个接口成功、14 个上游异常与输出异常、1 个旧需求版本前置拦截。上游调用恰好 18 次，没有隐藏重试。

2026-11-14 的 `--collection` 复验也通过：19 个场景、17 个集合断言（0 失败），合计 22 次模拟上游调用及 22 个完成请求事件。集合中的四个成功操作额外调用了模拟模型，健康检查和两个输入边界请求没有调用模型。

## 新需求获取流程

同日新增 `/api/ai/intake` 的 20 项检查，与原有 19 项合计 39 项。首次实跑全部通过：初始表达生成四组相关项，回答后保留条目编号，草稿模式停止提问；已答与已暂缓维度不重复问；无依据的专业数值、暂缓回答中的数量和前次草稿中的参数不能升级为用户确认值；建议不自动成为必须项；既有现场核实待办保留。还验证伪造引用、重复或丢失编号、未知依赖与格式错误被拒绝，重复回答在调用模型前被拦截。

这轮基线场景共调用模拟上游 37 次；每个有效请求恰好一次，两个输入失败不请求模型。第一次附带的四接口集合为 17 个断言，合计上游 41 次。随后集合更新为五接口并重新运行：**39 个基线场景、21 个 Postman 断言全部通过，0 失败；总计 42 次模拟上游调用及 42 个完成请求事件。**

mock 根据 `operation: intake` 标记和 `{ operation, input, sources }` 消息处理新流程。默认成功结果使用合成厨房、全局水电检查、客厅走道交界和归属待定项目。它只用于验证接口和页面行为，不代表模型对任意自然语言的理解能力。可以通过 `/__scenario` 选择 `intake-unverified-number`、`intake-suggestion-must`、`intake-repeat-question`、`intake-drops-site-pending` 等明确异常；每次切换不会改变生产服务。

## 项目背景作为单一来源

同日扩展可选 `projectContext` 后，新增背景原文引用和重复背景编号前置拦截两项。**41 个基线场景、21 个 Postman 断言通过，0 失败。** 基线产生 38 次模拟上游调用，含集合为 43 次，日志记录 43 个完成事件。

这两项验证背景随真实 HTTP 请求传到替身，`context:household` 引用必须来自请求中的背景原文，并且无效重复编号不会消耗上游调用。背景 `confirmed` 仅是用户核对标记；模拟通过不能证明真实模型理解正确或工程条件已经确认。以前的 19/39 项记录保留为历史证据。

浏览器联调可以单独启动下面的依赖与真实 API，再让开发网页代理到测试 API。请先确认端口空闲，并在结束后关闭自己启动的进程：

```sh
postman simulation run postman/simulations/deepseek/deepseek.sim.yaml --port 5204 --output ndjson --no-history
```

另一个终端运行：

```sh
DEEPSEEK_API_KEY=simulation-only ALLOW_MOCK_PROVIDER=true \
DEEPSEEK_BASE_URL=http://127.0.0.1:5204/deepseek \
DEEPSEEK_MODEL=deepseek-flash HOST=127.0.0.1 PORT=5203 \
node mingma-api/src/server.ts
```

此命令不使用 `--env-file`。控制请求为 `POST http://127.0.0.1:5204/deepseek/__scenario`，JSON 内容如 `{"scenario":"success"}`；状态计数位于 `GET /deepseek/__stats`。两个端口都不是本机部署使用的 5188/5199。

若只需要单独启动依赖：

```sh
postman simulation run postman/simulations/deepseek/deepseek.sim.yaml --port 5202 --output ndjson --no-history
```

mock 的 `/__scenario` 与 `/__stats` 是仅用于本地测试的控制端点，不是 DeepSeek 正式接口；不应部署该 mock。未建模的接口返回 501。修改 handler 后需重启模拟。
