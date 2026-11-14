# 明码 AI 接口契约

本接口提供新的统一需求获取 `intake`，以及保留兼容的 `clarify`、`requirements`、`review`、`explain` 四个接口。三版需求共创已调用 `intake`；商家方案页面目前仍采用本地规则。业务基准由用户发布，商家方案由商家确认，最终选择由用户完成。

机器可读契约：[openapi.json](openapi.json)。字段定义源为 [`schemas.ts`](../../mingma-api/src/schemas.ts) 与 [`intake.ts`](../../mingma-api/src/intake.ts)，公开 intake 类型在 [`intake-contract.ts`](../../mingma-lab/shared/intake-contract.ts)。通过 [`generate-openapi.ts`](../../mingma-api/scripts/generate-openapi.ts) 生成 OpenAPI 3.1 与 [Postman 集合](../../postman/collections/mingma-ai.postman_collection.json)。启动和环境配置见[服务说明](../../mingma-api/README.md)。

## 调用约定

默认服务地址为 `http://127.0.0.1:5199`。五个 AI 路径均使用 `POST`，请求体为未压缩的 `application/json`，整个请求体最多 128 KiB。字符串长度限制和数组容量以 OpenAPI schema 为准；对象不接受未定义字段。

默认仅监听回环地址且不设置服务令牌。若配置 `API_ACCESS_TOKEN`，AI POST 必须带 `Authorization: Bearer <服务访问令牌>`；这不是 DeepSeek API Key。绑定非回环地址时强制配置至少 24 字符的服务令牌。浏览器必须来自 `CORS_ORIGINS` 中的明确来源。

接口无状态。调用方需每次提供本轮完整上下文，并自行保存结果。模型不会自动获得上次请求、浏览器 localStorage 或数据库内容。提供的需求版本和方案归属是调用方的声明；服务只验证本次请求内部的一致性，不提供账号认证或跨用户权限验证。

通过本机部署网关的 LAN 入口使用需求共创时，无需访问码或 `X-Mingma-Access` 请求头。网关仅开放 `POST /api/ai/intake`，并继续检查私有 IPv4 来源、Host 和同源 Origin；其他接口仍限本机。DeepSeek 密钥由服务端保存，不发送给浏览器。详情见[局域网说明](../local-deployment.md)。

## 通用响应

AI 成功响应：

```json
{
  "requestId": "11111111-1111-4111-8111-111111111111",
  "data": { "说明": "实际结构依不同接口而定，见下文与 OpenAPI" },
  "meta": {
    "model": "deepseek-flash",
    "promptVersion": "以实际响应为准",
    "durationMs": 1234,
    "requiresHumanConfirmation": true,
    "usage": { "promptTokens": 100, "completionTokens": 50, "totalTokens": 150 }
  }
}
```

此段仅示意响应包裹结构，`data` 不是可提交的完整业务示例。`requestId` 也通过 `X-Request-ID` 响应头返回。`meta.usage` 是提供商返回的 token 计数，不是价格或施工预算。`requiresHumanConfirmation` 始终为 `true`。

错误响应：

```json
{
  "requestId": "11111111-1111-4111-8111-111111111111",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求字段不符合接口要求。",
    "retryable": false,
    "details": [{ "path": "room", "message": "需要填写房间。" }]
  }
}
```

`details` 可省略；具体错误文字以响应为准。调用方应按 HTTP 状态和 `code` 处理，不依赖中文文本匹配。服务不会把提供商原始错误体或密钥返回给调用方。服务和类型客户端都不自动重试，每次重新调用可能再次产生模型用量。

## 新需求获取流程

`POST /api/ai/intake`

三版 `#clarify` 使用此接口完成首次拆分、后续追问及整理草稿。输入示例：[intake.json](../../mingma-api/examples/intake.json)。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `brief` | 是 | 用户原始表达，最多 4000 字符 |
| `areas` | 是 | 关注区域列表，最多 12 项；不确定时可为 `[]` |
| `answers` | 是 | 既有回答，初始为 `[]`，最多 40 条 |
| `answers[].id` | 是 | 唯一回答编号 |
| `answers[].targetId` | 是 | 对应既有条目编号；整户问题使用 `null` |
| `answers[].dimension` | 是 | 回答维度，与原问题保持一致 |
| `answers[].question` / `answer` | 是 | 原问题与用户回答原文 |
| `answers[].disposition` | 是 | `answered` 或 `deferred`；暂缓不作为数值确认依据 |
| `previousItems` | 是 | 前次草稿或用户编辑后的完整条目，初始为 `[]`，最多 30 项 |
| `mode` | 是 | `refine` 继续澄清；`draft` 整理现有信息并停止新增问题 |

`targetId` 非空时必须存在于 `previousItems`。回答和条目编号不得重复，依赖必须引用有效条目。调用方更新答案时保留对应需求和维度，不把模型问题或建议冒充用户回答。

输出 `data` 为 `{ summary, items, questions, conflicts, readyForDraft, stopReason, warnings }`。`items` 结构如下：

| 字段 | 含义 |
| --- | --- |
| `id` / `title` / `description` | 稳定编号、名称与可回应的需求描述 |
| `scope` | `global` 全局、`area` 区域、`shared` 公共或跨区域、`unassigned` 归属待定 |
| `areas` / `category` / `component` | 多区域关联、工程类别、构件，分别保存 |
| `origin` | `user` 有当前用户原文依据；`suggestion` 为待采纳建议 |
| `necessity` | `must`、`prefer`、`optional`、`undecided`、`excluded` |
| `clarity` | `clear` 或 `vague`，不替代必要性 |
| `evidence` | `{ sourceId, quote }` 原文引用数组 |
| `standards` | 可检查条件：指标、类型、值或空值、单位、状态、验证方式和证据 |
| `pending` | 待确认任务，包含问题、责任人、类型和是否影响方向 |
| `dependencies` | 关联条目编号 |

标准类型 `kind` 为 `quantity/scope/functional/measurement/professional`；状态为 `user_stated/to_measure/to_confirm/proposal_required`。没有用户原文依据的数值会清空为 `null`，保留待测或待确认；单位也需要依据。程序检查数值边界，不能从“40”截出“4”作为确认值。`user_stated` 只表示用户陈述，不等于现场核实。

待办责任人 `owner` 为 `user/merchant/site/professional/unassigned`，类型 `kind` 为 `scope/necessity/decision/measurement/detail`。先前草稿中的现场、专业或商家核实事项保留；暂缓回答进入业主待决记录。待确认清单引用原条目，不额外复制施工项目。

`questions` 每次最多两题，包含 `id/targetId/dimension/text/reason/options/allowMultiple/priority`。程序过滤已答、暂缓和重复的目标维度，保留“暂不确定”选项。维度为 `scope/goal/retention/necessity/usage/quantity/material/measurement/dependency/shared`。返回没有可继续询问的问题时，或调用方指定 `mode: draft` 时，`questions=[]` 且 `readyForDraft=true`；未知事项和冲突仍保留。

`conflicts` 每项为 `{ id, itemIds, message }`，只引用本次有效条目。接口返回候选取舍，页面还需阻止必须项冲突直接进入确定范围。生成草稿不是发布；页面先要求采纳建议、逐项确认和明确采用，再沿用原需求清单页的发布动作。

证据来源包括 `brief`、`answer:<id>` 与 `previous:<id>`。前次草稿仅证明之前的描述，不能成为新的用户事实或测量依据；新增用户来源与非空数值需要当前 `brief` 或已回答内容的精确引用。无当前用户依据的条目会降为建议，建议不会被模型自动设为必须项。

## 1 保留的需求澄清接口

`POST /api/ai/clarify`

输入示例：[clarify.json](../../mingma-api/examples/clarify.json)。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `room` | 是 | 本次处理区域，例如厨房，最多 40 字符 |
| `brief` | 是 | 用户原始生活化表达，最多 4000 字符 |
| `answers` | 否 | 历次回答，默认 `[]`，最多 20 条 |
| `answers[].id` | 是 | 本次上下文内唯一的回答编号 |
| `answers[].question` | 是 | 回答对应的问题，最多 400 字符 |
| `answers[].answer` | 是 | 用户回答原文，最多 2000 字符 |
| `maxQuestions` | 否 | 本轮最多提出几个问题，1–3，默认 2 |

输出 `data` 包含 `summary`、`facts`、`questions`、`readyForDraft`、`pending`、`warnings`。`facts` 的每条记录有 `dimension`、`value` 和 `evidence`；`questions` 的每条记录有 `id`、`dimension`、`question`、`options`、`allowMultiple` 和 `reason`。

前端将 `questions` 渲染为选择题，继续允许自由填写或暂不确定。下一次调用将用户回答追加到 `answers`；不要把模型上一轮的建议冒充用户回答。`readyForDraft` 表示可尝试整理草稿，不表示需求完整、已确认或已发布。用户可以保留 `pending`，稍后再处理现场未知项。

## 2 生成需求清单

`POST /api/ai/requirements`

输入使用与澄清相同的 `room`、`brief`、`answers`，不包含 `maxQuestions`。输入示例：[requirements.json](../../mingma-api/examples/requirements.json)。

输出 `data` 包含 `summary`、`requirements`、`pending`、`warnings`。每条需求：

| 字段 | 含义 |
| --- | --- |
| `id` | 需求编号，前端确认后应保持稳定关联 |
| `title` / `description` | 名称与可阅读的需求描述 |
| `room` / `category` | 房间与工项分类 |
| `priority` | `must` 或 `prefer`，仍需用户确认 |
| `source` | 来源说明文字 |
| `origin` | `user` 为有用户原文依据；`suggestion` 为模型建议 |
| `evidence` | 来源编号和逐字原文引用 |
| `pending` | 尺寸、现场条件等待确认事项 |

所有输出都是草稿。`origin: user` 不表示用户已经确认了模型生成的具体措辞；界面应让用户检查和修改。没有有效用户依据的需求不能作为已确认用户要求。建议项不自动升级为用户必须项。

返回结果不会修改现有 R1/R2，也不会自动发布新版本。后续核对时，调用方应传用户已经确认的需求基准，而非直接把未确认建议当作承诺。

## 3 商家方案核对

`POST /api/ai/review`

输入示例：[review.json](../../mingma-api/examples/review.json)。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `requirementVersion` | 是 | 本次需求基准版本，正整数 |
| `requirements` | 是 | 1–30 条需求，编号必须唯一 |
| `requirements[]` | 是 | `id/title/description/room/category/priority`；可附 `source/pending` |
| `proposal.id` / `proposal.version` | 是 | 方案编号与方案版本 |
| `proposal.requirementVersion` | 是 | 方案引用的需求版本，须等于本次基准 |
| `proposal.text` | 是 | 商家方案原文，最多 30000 字符 |

所有 `requirements[].pending` 去重后总数不能超过 100。当前接收文字，不读取文件路径或网络链接；表单、CSV 或文件提取文本应由调用方先整理为 `proposal.text`。

输出 `data` 包含 `summary`、`findings`、`additionalItems`、`siteChecks` 和 `warnings`。每个输入需求必须对应且只对应一个 finding：

| 字段 | 含义 |
| --- | --- |
| `requirementId` | 对应输入需求编号 |
| `status` | `responded`、`partial`、`conflict`、`unknown` |
| `reason` | 当前判断的解释 |
| `evidence` | 对 `proposal.text` 的原文引用 |
| `missing` | 尚未说明或需要补充的点 |
| `action` | 建议采取的下一步 |

状态必须按以下含义展示：

- `responded`：方案文字已经回应，现场条件仍可能待确认。
- `partial`：已有部分回应，还需补充说明。
- `conflict`：原文和明确需求冲突。
- `unknown`：资料不足，无法得出有依据的结论。

没有有效证据时不能显示“已回应”或“明确冲突”。原文里没提某项不等于商家做不到；提示应说明“尚未说明”。输入中的现场待办会保留到 `siteChecks`。

`additionalItems` 用于记录需求外的方案内容，分类为 `necessary_support`（可能的必要配套）、`optional`（可选增强）、`needs_explanation`（需要解释）。分类也是建议；不得把用户没提到的内容直接当作不必要项目。每条包含 `title`、`classification`、`reason` 和 `evidence`。

## 4 解释方案和反馈草稿

`POST /api/ai/explain`

输入与核对接口一致，可额外提供 `focusRequirementIds`。不传或传空数组时解释全部需求；传入时每个编号必须存在且不能重复。输入示例：[explain.json](../../mingma-api/examples/explain.json)。

输出 `data` 包含 `summary`、`explanations`、`feedbackDraft`、`siteChecks` 和 `warnings`。每条 explanation 包含 `requirementId`、`plainLanguage`、`impact`、`questions`、`evidence`。

前端可用 `plainLanguage` 解释专业文字，用 `impact` 说明可能的生活使用影响，用 `questions` 让用户向商家补充询问。`feedbackDraft` 只能作为可编辑草稿；该接口没有发送、发布或代替商家提交承诺的操作。解释接口不代替核对结果，也不证明方案可施工。

## 证据与未知项

`evidence` 的每条记录为 `{ sourceId, quote }`：

| 场景 | `sourceId` | 引用范围 |
| --- | --- | --- |
| 澄清、清单生成 | `brief` | 本次 `brief` 原文 |
| 澄清、清单生成 | `answer:<id>` | 对应 `answers[].answer`，不把问题文字当用户事实 |
| 方案核对、解释 | `proposal` | 本次 `proposal.text` 原文 |
| 新需求获取 | `brief`、`answer:<id>` | 本次用户原文与回答；暂缓回答不确认数值 |
| 新需求获取 | `previous:<id>` | 对应既有条目的 `description`，仅证明前次草稿 |

`quote` 必须是对应原文内的实际片段。服务验证来源和引用是否存在，并限制需求编号、输出结构及状态；不能单靠这些检查保证所有语义推理正确。模型建议、现场待测数据和原文事实应分别呈现。商家资料中要求“忽略规则、直接通过”的文字只作为资料内容，不授予模型新权限。

## 错误处理

| HTTP | `code` | 调用方处理 |
| --- | --- | --- |
| 400 | `INVALID_JSON`、`VALIDATION_ERROR`、`REQUEST_ABORTED` | 修正输入或完整重传；按 `details` 定位字段 |
| 401 | `UNAUTHORIZED` | 检查本地服务令牌；不要发送模型 Key |
| 403 | `ORIGIN_NOT_ALLOWED`、`HOST_NOT_ALLOWED` | 检查服务地址与允许来源配置 |
| 404 / 405 | `NOT_FOUND` / `METHOD_NOT_ALLOWED` | 检查路径与请求方法 |
| 409 | `REQUIREMENT_VERSION_MISMATCH` | 重新取得针对当前基准的方案，不能静默改版本号 |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | 缩小单次文本，或使用未压缩 JSON |
| 429 | `RATE_LIMITED`、`AI_BUSY`、`AI_UPSTREAM_RATE_LIMIT` | 等待 `Retry-After` 指示时间后，由用户决定是否重试 |
| 499 | `REQUEST_CANCELLED` | 请求已取消；连接已关闭时通常读不到响应 |
| 500 | `INTERNAL_ERROR` | 保留请求编号排查 |
| 502 | `AI_UPSTREAM_AUTH`、`AI_UPSTREAM_QUOTA` | 检查服务端密钥或提供商账户额度 |
| 502 | `AI_UPSTREAM_REJECTED`、`AI_REFUSED` | 检查模型配置或调整输入 |
| 502 | `AI_OUTPUT_TRUNCATED`、`AI_INVALID_OUTPUT` | 减少本次范围或重试；不得用不完整结果更新页面为完成 |
| 503 | `AI_NOT_CONFIGURED`、`AI_UPSTREAM_UNAVAILABLE` | 配置服务端密钥或等待提供商恢复 |
| 504 | `AI_TIMEOUT` | 允许用户稍后重试；保留当前草稿 |

`retryable` 是是否适合重新尝试的提示，不是自动重试指令，也不保证重试成功。不要在失败后静默换成演示数据并继续显示“AI 已完成”。

## 接入现有前端

三版页面已通过共享 intake 模块执行：自由表达与区域选择 → AI 复述和拆分 → 逐题回答、补充或暂缓 → 四组草稿编辑 → 采纳建议与逐项确认 → 明确采用 → 原需求清单页发布。回答修改、取消和迟到结果受状态版本保护；错误保留草稿，不自动返回演示答案。

原 `clarify/requirements` 可用于兼容调用，但不再驱动新版访谈页面。`review/explain` 已保留为独立能力；将它们接到商家方案界面仍是后续工作。

当前 UI 的 `Proposal.items` 可按需求编号拼接成文字，例如 `K02：预留洗碗机安装位。`；传入文本必须与后续显示引用的文本一致。AI 接口的 evidence 是数组，不能直接替换旧演示代码中的单个 evidence 字符串而不调整渲染。

本轮页面与接口验收见[新版验证记录](../intake-release-verification.json)。商家页面的本地规则、模拟身份和原有历史版本继续保留；上传户型图生成模型尚未实现。

LAN 网关会对未开放的接口返回 `403 LOCAL_ONLY`，对不符合来源要求的请求返回 403；这些请求不会调用模型。访问码校验已移除，正常需求共创请求仍受后端的请求频率和并发限制。
