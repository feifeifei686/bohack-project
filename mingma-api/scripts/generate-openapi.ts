import { FloorplanRequest, FloorplanOutput } from '../src/floorplan.ts'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { schemas, successSchema, ErrorResponse, type Operation } from '../src/schemas.ts'

const descriptions: Record<Operation, { title: string; description: string }> = {
  intake: { title: '分组获取需求与动态追问', description: '以全局、区域、公共项组织需求，把待确认作为状态保留。可附带最多三项来自“我的需求”的 projectContext 项目背景，作为约束和 context:<id> 引用来源，不重复填写、不自动生成施工项目；背景已核对不代表工程条件已确认。每轮最多两个追问，已答/暂缓维度不重复。mode=draft只整理草稿。保留既有编号、原文依据与未知数值，结果不会发布需求。' },
  clarify: { title: '澄清生活化需求', description: '提取有原文依据的事实，并提出最多 maxQuestions 个后续问题。readyForDraft 只是整理草稿的建议，不表示需求已经发布。answers.id 必须唯一。' },
  requirements: { title: '生成待确认需求清单', description: '生成需求草稿，区分用户来源和模型补充建议。evidence 引用 brief 或 answer:<id> 的原文；输出不会创建已发布需求版本。' },
  review: { title: '逐项核对商家方案', description: '针对当前需求版本逐条核对。每个需求恰好返回一条 finding，引用 proposal.text；版本不一致返回 409。已回应只表示方案文字回应，不代表现场条件已确认。' },
  explain: { title: '解释方案并起草反馈', description: '解释 focusRequirementIds 中的需求；未指定或空数组时解释全部需求。输出反馈草稿，不发送消息、不替商家承诺、不改变需求或方案状态。' },
}
const operations = Object.keys(schemas) as Operation[]
const inputs = Object.fromEntries(operations.map(operation => [operation, JSON.parse(readFileSync(new URL(`../examples/${operation}.json`, import.meta.url), 'utf8'))])) as Record<Operation, unknown>
const jsonSchema = (schema: z.ZodType, io: 'input' | 'output') => {
  const value = z.toJSONSchema(schema, { target: 'draft-2020-12', io })
  delete value.$schema
  return value
}
const errors: Record<string, string> = {
  '400': 'INVALID_JSON / VALIDATION_ERROR / REQUEST_ABORTED：输入格式、字段或编号不合法。',
  '401': 'UNAUTHORIZED：已配置访问令牌时，缺少或无效的服务令牌。',
  '403': 'ORIGIN_NOT_ALLOWED / HOST_NOT_ALLOWED：网页来源或主机名不被允许。',
  '405': 'METHOD_NOT_ALLOWED：该接口不支持此方法。',
  '409': 'REQUIREMENT_VERSION_MISMATCH：方案引用的需求版本不是本次基准。',
  '413': 'PAYLOAD_TOO_LARGE：请求体超过 128 KiB。',
  '415': 'UNSUPPORTED_MEDIA_TYPE：请使用未压缩的 application/json。',
  '429': 'RATE_LIMITED / AI_BUSY / AI_UPSTREAM_RATE_LIMIT：本地限流、并发已满或模型服务限流。',
  '499': 'REQUEST_CANCELLED：客户端已中断；连接关闭时通常无法接收该响应。',
  '500': 'INTERNAL_ERROR：服务内部错误。',
  '502': 'AI_UPSTREAM_AUTH / AI_UPSTREAM_QUOTA / AI_UPSTREAM_REJECTED / AI_REFUSED / AI_OUTPUT_TRUNCATED / AI_INVALID_OUTPUT：模型服务拒绝、返回不完整内容或输出校验未通过。',
  '503': 'AI_NOT_CONFIGURED / AI_UPSTREAM_UNAVAILABLE：缺少服务端密钥或模型服务不可用。',
  '504': 'AI_TIMEOUT：模型服务超过配置的等待时间。',
}
const errorResponses = Object.fromEntries(Object.entries(errors).map(([code, description]) => [code, {
  description,
  ...(code === '429' ? { headers: { 'Retry-After': { description: '建议等待的秒数。', schema: { type: 'integer', example: 60 } } } } : {}),
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
}]))
const componentSchemas: Record<string, unknown> = { ErrorResponse: jsonSchema(ErrorResponse, 'output') }
const paths: Record<string, unknown> = {}
for (const operation of operations) {
  const name = operation[0]!.toUpperCase() + operation.slice(1)
  componentSchemas[`${name}Request`] = jsonSchema(schemas[operation].input, 'input')
  componentSchemas[`${name}Response`] = jsonSchema(successSchema(operation), 'output')
  paths[`/api/ai/${operation}`] = {
    post: {
      tags: ['AI'], operationId: operation, summary: descriptions[operation].title,
      description: descriptions[operation].description,
      security: [{}, { localAccessToken: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Request` }, example: inputs[operation] } } },
      responses: {
        '200': {
          description: '经过结构与来源校验的 AI 建议。始终需要人工确认，不写入项目或发送消息。',
          headers: { 'X-Request-ID': { description: '排查问题的请求编号。', schema: { type: 'string', format: 'uuid' } } },
          content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Response` } } },
        }, ...errorResponses,
      },
    },
  }
}
componentSchemas.FloorplanRequest = jsonSchema(FloorplanRequest, 'input')
componentSchemas.FloorplanResult = jsonSchema(FloorplanOutput, 'output')
paths['/api/ai/floorplan'] = { post: {
  tags: ['AI'], operationId: 'recognizeFloorplan', summary: '识别上传户型图中的房间、门窗和家具',
  description: '接受单张 JPEG/PNG/WebP base64 data URL，解码后至多4MiB。完整图像坐标归一化为0..1000；不生成图中不存在的家具，不推断真实尺寸。图片仅用于本次DeepSeek视觉识别，不写入日志或磁盘。局域网同源可调用。结果需用户校对。',
  security: [{}, { localAccessToken: [] }],
  requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/FloorplanRequest' } } } },
  responses: {
    '200': { description: '候选几何与来源模型，等待校对。', content: { 'application/json': { schema: jsonSchema(z.object({requestId:z.string(),data:FloorplanOutput,meta:z.object({model:z.string(),requiresHumanConfirmation:z.literal(true),durationMs:z.number(),usage:z.object({promptTokens:z.number(),completionTokens:z.number(),totalTokens:z.number()})})}), 'output') } } },
    ...errorResponses,
    '413': {description:'图片请求体超过6MiB。'},
    '422': {description:'FLOORPLAN_NOT_FOUND：未识别到清晰户型，请换图或手工标注。'}
  }
} }
paths['/api/health'] = { get: {
  tags: ['Service'], operationId: 'health', summary: '检查服务及密钥配置状态', security: [],
  description: '不请求模型，不验证账户余额或实时可用性。无需服务访问令牌，但仍检查 Host 与 Origin。',
  responses: { '200': { description: '服务运行中。', content: { 'application/json': { schema: {
    type: 'object', additionalProperties: false,
    required: ['status', 'service', 'version', 'aiConfigured', 'model'],
    properties: { status: { const: 'ok' }, service: { const: 'mingma-ai-api' }, version: { type: 'string' }, aiConfigured: { type: 'boolean' }, model: { type: 'string' } },
  } } } }, '403': errorResponses['403'] },
} }
paths['/api/openapi.json'] = { get: {
  tags: ['Service'], operationId: 'getOpenApi', summary: '读取当前接口契约', security: [],
  description: '返回本生成器写入的 OpenAPI 3.1 文档；首次启动前执行 npm run build。',
  responses: { '200': { description: 'OpenAPI 3.1 文档。', content: { 'application/json': { schema: { type: 'object' } } } }, '403': errorResponses['403'], '500': errorResponses['500'] },
} }
const spec = {
  openapi: '3.1.0', jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  info: { title: '明码 AI 接口', version: '0.1.0', description: '分组需求获取、动态追问、清单草稿、方案核对与解释反馈。当前为无状态服务端模型适配层；无账号、数据库、文件解析或发布操作。所有结论都需要人工确认，不包含价格分析。输入/输出 schema 的源文件为 mingma-api/src/schemas.ts。' },
  servers: [{ url: 'http://127.0.0.1:5199', description: '本地开发服务' }],
  tags: [{ name: 'AI', description: '每次请求最多调用一次模型，无自动重试。' }, { name: 'Service', description: '本地运行和契约信息。' }],
  paths,
  components: {
    schemas: componentSchemas,
    securitySchemes: { localAccessToken: { type: 'http', scheme: 'bearer', description: '独立的 API_ACCESS_TOKEN，不是 DeepSeek API Key。配置后所有 AI POST 接口必须携带；默认仅回环地址运行且未设置令牌时可省略。绑定非回环地址时要求至少 24 字符。' } },
  },
}
const specPath = fileURLToPath(new URL('../../docs/api/openapi.json', import.meta.url))
mkdirSync(dirname(specPath), { recursive: true })
writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`)

// Request examples and assertions are generated beside the spec from the same inputs.
const requestItem = (operation: Operation) => ({
  name: descriptions[operation].title,
  request: { method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }],
    body: { mode: 'raw', raw: JSON.stringify(inputs[operation], null, 2), options: { raw: { language: 'json' } } },
    url: `{{baseUrl}}/api/ai/${operation}`, description: descriptions[operation].description,
  },
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
    "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
    "const body = pm.response.json();",
    "pm.test('structured result and manual confirmation', () => { pm.expect(body.requestId).to.be.a('string'); pm.expect(body.data).to.be.an('object'); pm.expect(body.meta.requiresHumanConfirmation).to.equal(true); pm.expect(body.meta.model).to.be.a('string'); pm.expect(body.meta.usage.totalTokens).to.be.a('number'); });",
    "pm.test('warnings available', () => pm.expect(body.data.warnings).to.be.an('array'));",
    ...(operation === 'review' ? ["pm.test('every requirement has one finding', () => { const input = JSON.parse(pm.request.body.raw); pm.expect(body.data.findings.map(x => x.requirementId).sort()).to.eql(input.requirements.map(x => x.id).sort()); });"] : []),
    ...(operation === 'explain' ? ["pm.test('focus preserved', () => { const input = JSON.parse(pm.request.body.raw); pm.expect(body.data.explanations.map(x => x.requirementId).sort()).to.eql(input.focusRequirementIds.slice().sort()); });"] : []),
    ...(operation === 'intake' ? ["pm.test('intake groups and questions', () => { pm.expect(body.data.items).to.be.an('array').that.is.not.empty; pm.expect(body.data.questions.length).to.be.at.most(2); const ids = body.data.items.map(x => x.id); pm.expect(new Set(ids).size).to.equal(ids.length); });"] : []),
  ] } }],
})
const collection = {
  info: { name: '明码 AI 本地接口', description: '合成装修需求数据。五个成功请求会调用实际配置的模型；运行前确认目标服务和成本。自动生成自 schemas.ts 与 examples/，不要将真实密钥写入变量。', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:5199', type: 'string' }, { key: 'accessToken', value: '', type: 'string' }],
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    "const token = pm.variables.get('accessToken');",
    "if (token) pm.request.headers.upsert({ key: 'Authorization', value: 'Bearer ' + token });",
  ] } }],
  item: [
    { name: '服务健康状态', request: { method: 'GET', url: '{{baseUrl}}/api/health' }, event: [{ listen: 'test', script: { type: 'text/javascript', exec: ["pm.test('health', () => { pm.response.to.have.status(200); pm.expect(pm.response.json().service).to.equal('mingma-ai-api'); });"] } }] },
    ...operations.map(requestItem),
    ...[
      { name: '拒绝未知输入字段', operation: 'clarify', body: { ...inputs.clarify as object, unexpected: true }, status: 400, code: 'VALIDATION_ERROR' },
      { name: '拒绝过期需求版本', operation: 'review', body: { ...inputs.review as object, requirementVersion: 2 }, status: 409, code: 'REQUIREMENT_VERSION_MISMATCH' },
    ].map(test => ({
      name: test.name, request: { method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }], body: { mode: 'raw', raw: JSON.stringify(test.body, null, 2), options: { raw: { language: 'json' } } }, url: `{{baseUrl}}/api/ai/${test.operation}` },
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [`pm.test('expected boundary error', () => { pm.response.to.have.status(${test.status}); pm.expect(pm.response.json().error.code).to.equal('${test.code}'); });`] } }],
    })),
  ],
}
const collectionPath = fileURLToPath(new URL('../../postman/collections/mingma-ai.postman_collection.json', import.meta.url))
mkdirSync(dirname(collectionPath), { recursive: true })
writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`)
console.log('Generated docs/api/openapi.json and Postman collection from schemas and examples.')
