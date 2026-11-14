/** Local-only test dependency. Never deploy: control endpoints are intentionally unauthenticated. */
const http = require('node:http');
const scenarios = new Set(['success', '401', '402', '429', '500', 'html-error', 'html-success', 'empty', 'bad-json', 'truncated', 'timeout', 'forged-evidence', 'bad-schema', 'duplicate-finding', 'refused', 'intake-unverified-number', 'intake-suggestion-must', 'intake-duplicate-id', 'intake-missing-previous', 'intake-unknown-dependency', 'intake-repeat-question', 'intake-valid-number', 'intake-deferred-number', 'intake-previous-number', 'intake-no-evidence', 'intake-draft-with-questions', 'intake-drops-site-pending']);
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const evidence = (sourceId, quote) => [{ sourceId, quote }];
const intakeQuestions = () => [
  { id: 'q-cleaning', targetId: 'N001', dimension: 'goal', text: '你说好打理，主要想减少哪些清洁负担？', reason: '先明确生活目标，商家才能解释对应做法。', options: ['油污擦拭', '接缝积灰', '开放格积灰', '暂不确定'], allowMultiple: true, priority: 'intent' },
  { id: 'q-shared', targetId: 'N003', dimension: 'shared', text: '客厅和走道的地面连贯，主要指哪些方面？', reason: '区分区域目标与交界处理，避免默认全部同材同规格。', options: ['颜色接近', '交界自然', '同一种材料', '暂不确定'], allowMultiple: true, priority: 'shared' },
];
function intakeResult(input) {
  const quote = input.brief.slice(0, 700);
  const base = (id, title, scope, areas, category, component, description, origin, necessity) => ({
    id, title, scope, areas, category, component, description, origin, necessity,
    clarity: 'vague', evidence: origin === 'user' ? evidence('brief', quote) : [], standards: [], pending: [], dependencies: [],
  });
  const initial = [
    { ...base('N001', '厨房清洁与设备使用', 'area', ['厨房'], '材料与使用', '墙面与台面', '说明厨房墙面与台面的清洁方式，并回应新增设备使用需求。', 'user', 'prefer'),
      standards: [{ metric: '材料与配套说明', kind: 'functional', value: null, unit: null, status: 'proposal_required', verification: '商家分别说明清洁维护方式及设备配套。', evidence: [] }],
      pending: [{ question: '设备型号与现场接口待确认', owner: 'site', kind: 'measurement', blocking: false }],
    },
    { ...base('N002', '全局水电现状检查', 'global', [], '水电', '现有水电设施', '建议先由专业人员检查本次改造相关的现有条件，再说明是否需要调整。', 'suggestion', 'optional'),
      standards: [{ metric: '现有线路参数', kind: 'professional', value: null, unit: null, status: 'to_confirm', verification: '由专业人员根据现场检查记录确认。', evidence: [] }],
      pending: [{ question: '现有水电条件需要专业复核', owner: 'professional', kind: 'detail', blocking: false }],
    },
    { ...base('N003', '客厅与走道地面交界', 'shared', ['客厅', '走道'], '泥瓦与饰面', '地面交界', '请商家说明客厅到走道的视觉衔接与交界处理。', 'user', 'prefer'),
      standards: [{ metric: '交界现状高差', kind: 'measurement', value: null, unit: 'mm', status: 'to_measure', verification: '现场测量并记录交界位置。', evidence: [] }],
      pending: [{ question: '交界的具体范围待业主确认', owner: 'user', kind: 'scope', blocking: false }],
    },
    { ...base('N004', '管井包封是否纳入', 'unassigned', [], '安装', '管井包封', '如现场存在需要处理的管井，请先说明位置和必要性，由业主决定是否纳入。', 'suggestion', 'undecided'),
      pending: [{ question: '位置与是否必做待确认', owner: 'user', kind: 'decision', blocking: false }],
    },
  ];
  // Continuing requests retain client-edited records and IDs; the mock only
  // updates the dimension addressed by an explicit synthetic answer.
  const items = input.previousItems?.length ? structuredClone(input.previousItems) : initial;
  const answered = (input.answers || []).filter(answer => answer.disposition === 'answered');
  const cleaning = answered.find(answer => answer.targetId === 'N001' && answer.dimension === 'goal');
  if (cleaning) {
    const item = items.find(item => item.id === 'N001');
    if (item) { item.description = `厨房清洁目标：${cleaning.answer}。请商家说明对应做法与维护方式。`; item.clarity = 'clear'; item.evidence = evidence(`answer:${cleaning.id}`, cleaning.answer); }
  }
  const shared = answered.find(answer => answer.targetId === 'N003' && answer.dimension === 'shared');
  if (shared) {
    const item = items.find(item => item.id === 'N003');
    if (item) { item.description = `客厅与走道的地面交界目标：${shared.answer}。`; item.clarity = 'clear'; item.evidence = evidence(`answer:${shared.id}`, shared.answer); item.pending = item.pending.filter(todo => todo.kind !== 'scope'); }
  }
  // Synthetic context handling proves the HTTP caller provides the canonical
  // background as a separately citable source, not as a duplicate answer.
  const background = input.projectContext?.[0];
  if (background && items.length) {
    items[0].evidence = [...items[0].evidence.filter(citation => !citation.sourceId.startsWith('context:')).slice(0, 5), { sourceId: `context:${background.id}`, quote: background.text.slice(0, 700) }];
  }
  const questions = input.mode === 'draft' ? [] : intakeQuestions().filter(question =>
    items.some(item => item.id === question.targetId) && !(input.answers || []).some(answer => answer.targetId === question.targetId && answer.dimension === question.dimension));
  return {
    summary: '已按全局、区域、公共交界和待确认事项整理需求。请先核对生活目标，再决定建议项是否纳入。',
    items, questions, conflicts: [], readyForDraft: questions.length === 0,
    stopReason: questions.length ? '还有业主可以回答的使用目标需要澄清。' : '剩余现场与专业信息已列为待办，可以先查看草稿。',
    warnings: ['这是合成依赖模拟的结果，用于验证流程；数值与现场条件没有自动确认。'],
  };
}
function result(operation, input) {
  if (operation === 'floorplan') return {"rooms": [{"id": "living", "name": "客厅", "kind": "living", "polygon": [[100, 100], [600, 100], [600, 400], [400, 400], [400, 800], [100, 800]], "confidence": 0.9}, {"id": "bedroom", "name": "卧室", "kind": "bedroom", "polygon": [[600, 100], [900, 100], [900, 800], [600, 800]], "confidence": 0.85}], "walls": [{"roomId": "living", "start": [100, 100], "end": [600, 100]}, {"roomId": "bedroom", "start": [900, 100], "end": [900, 800]}], "openings": [{"roomId": "living", "kind": "window", "start": [200, 100], "end": [400, 100]}], "furniture": [{"id": "bed1", "roomId": "bedroom", "kind": "bed", "bounds": [650, 300, 200, 300], "rotation": 90, "confidence": 0.9}], "warnings": ["合成测试图形，不代表模型识别准确率。"]};
  if (operation === 'intake') return intakeResult(input);
  if (operation === 'clarify') return {
    summary: '已记录厨房使用需求，还需确认设备信息。',
    facts: [{ dimension: '使用需求', value: input.brief, evidence: evidence('brief', input.brief) }],
    questions: [{ id: 'device-model', dimension: '设备', question: '洗碗机型号是否已经确定？', options: ['已经确定', '尚未确定', '暂不确定'], allowMultiple: false, reason: '用于明确待补充的设备资料。' }],
    readyForDraft: false, pending: ['设备型号待确认'], warnings: [],
  };
  if (operation === 'requirements') return {
    summary: '根据用户原文整理一条待确认需求。',
    requirements: [{ id: 'AI01', title: '厨房改造诉求', description: input.brief, room: input.room, category: '使用需求', priority: 'prefer', source: '用户原文', pending: ['现场尺寸待确认'], origin: 'user', evidence: evidence('brief', input.brief) }],
    pending: ['现场尺寸待确认'], warnings: [],
  };
  const quote = input.proposal.text.slice(0, 300);
  if (operation === 'review') return {
    summary: '商家文字已回应部分内容，仍需补充具体配套。',
    findings: input.requirements.map(r => ({ requirementId: r.id, status: 'partial', reason: '当前原文尚未明确全部配套。', evidence: evidence('proposal', quote), missing: ['需补充具体配套说明'], action: '请商家补充后交用户确认。' })),
    additionalItems: [], siteChecks: [], warnings: [],
  };
  if (operation === 'explain') {
    const ids = input.focusRequirementIds?.length ? input.focusRequirementIds : input.requirements.map(r => r.id);
    return {
      summary: '方案说明了安装意向，实际条件仍待核实。',
      explanations: ids.map(id => ({ requirementId: id, plainLanguage: '商家先说明了准备安排的位置。', impact: '配套细节还需要说明，不能据此判断现场已经可施工。', questions: ['请补充配套细节及现场待确认事项。'], evidence: evidence('proposal', quote) })),
      feedbackDraft: '请补充方案对应配套说明和现场待确认事项，再交用户确认。', siteChecks: [], warnings: [],
    };
  }
  throw new Error('Unsupported operation');
}
http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local.test').pathname;
    if (path === '/__scenario' && req.method === 'POST') {
      const name = req.body?.scenario;
      if (!scenarios.has(name)) return send(res, 400, { error: 'Unknown local scenario' });
      await pm.state.set('deepseek.scenario', name);
      return send(res, 200, { scenario: name });
    }
    if (path === '/__stats' && req.method === 'GET') return send(res, 200, {
      requests: (await pm.state.get('deepseek.requests')) || 0,
      operations: (await pm.state.get('deepseek.operations')) || {},
      scenario: (await pm.state.get('deepseek.scenario')) || 'success',
    });
    if (path !== '/chat/completions' || req.method !== 'POST') return send(res, 501, { error: 'Endpoint not modeled' });
    const body = req.body;
    if (!body || !Array.isArray(body.messages) || body.messages.length !== 2 || body.messages[0].role !== 'system' || body.messages[1].role !== 'user' || body.response_format?.type !== 'json_object' || !['disabled','enabled'].includes(body.thinking?.type) || body.stream !== false || !Number.isInteger(body.max_tokens) || body.max_tokens < 512 || typeof body.model !== 'string') {
      return send(res, 400, { error: 'DeepSeek caller request does not match modeled contract' });
    }
    const vision = Array.isArray(body.messages[1].content);
    if(vision && !body.messages[1].content.some(p=>p.type==='image_url' && p.image_url?.url.startsWith('data:image/'))) return send(res,400,{error:'Missing image'});
    const operation = vision ? 'floorplan' : body.messages[0].content.match(/^operation: (clarify|requirements|review|explain|intake)\b/)?.[1];
    const payload = vision ? {operation:'floorplan',input:{}} : JSON.parse(body.messages[1].content);
    if (!operation || payload.operation !== operation || !payload.input) return send(res, 400, { error: 'Missing operation or input' });
    const count = (await pm.state.get('deepseek.requests')) || 0;
    const ops = (await pm.state.get('deepseek.operations')) || {};
    ops[operation] = (ops[operation] || 0) + 1;
    await pm.state.set('deepseek.requests', count + 1);
    await pm.state.set('deepseek.operations', ops);
    const scenario = (await pm.state.get('deepseek.scenario')) || 'success';
    if (/^\d+$/.test(scenario)) return send(res, Number(scenario), { error: { message: 'UPSTREAM_PRIVATE_DETAIL must never be returned to API callers' } });
    if (scenario === 'html-error' || scenario === 'html-success') {
      res.writeHead(scenario === 'html-error' ? 500 : 200, { 'Content-Type': 'text/html' });
      return res.end('<html>UPSTREAM_PRIVATE_DETAIL</html>');
    }
    if (scenario === 'timeout') await new Promise(resolve => setTimeout(resolve, 2000));
    let data = result(operation, payload.input);
    if (scenario === 'forged-evidence' && data.findings) data.findings[0].evidence[0].quote = '伪造引用内容_FROM_TEST_NOT_IN_SOURCE';
    if (scenario === 'forged-evidence' && data.items) data.items[0].evidence = evidence('brief', '伪造引用内容_FROM_TEST_NOT_IN_SOURCE');
    if (scenario === 'duplicate-finding' && data.findings) data.findings.push({ ...data.findings[0] });
    if (operation === 'intake') {
      if (scenario === 'intake-unverified-number') data.items[0].standards = [{ metric: '线路规格', kind: 'professional', value: '4', unit: 'mm²', status: 'user_stated', verification: '需要专业复核。', evidence: [] }];
      if (scenario === 'intake-suggestion-must') { data.items[1].origin = 'suggestion'; data.items[1].necessity = 'must'; }
      if (scenario === 'intake-duplicate-id') data.items.push(structuredClone(data.items[0]));
      if (scenario === 'intake-missing-previous') data.items = data.items.slice(1);
      if (scenario === 'intake-unknown-dependency') data.items[0].dependencies = ['UNKNOWN_ID'];
      if (scenario === 'intake-repeat-question' || scenario === 'intake-draft-with-questions') { data.questions = intakeQuestions(); data.readyForDraft = false; }
      if (scenario === 'intake-no-evidence') { data.items[0].origin = 'user'; data.items[0].evidence = []; }
      if (scenario === 'intake-drops-site-pending') for (const item of data.items) item.pending = item.pending.filter(todo => todo.owner !== 'site' && todo.owner !== 'professional');
      if (scenario === 'intake-valid-number') {
        const answer = payload.input.answers.find(answer => answer.dimension === 'quantity' && answer.disposition === 'answered');
        if (answer) data.items[0].standards = [{ metric: '同时使用的台面设备数量', kind: 'quantity', value: '3', unit: '台', status: 'user_stated', verification: '业主提供的使用数量，配套仍由商家说明。', evidence: evidence(`answer:${answer.id}`, answer.answer) }];
      }
      if (scenario === 'intake-deferred-number') {
        const answer = payload.input.answers.find(answer => answer.disposition === 'deferred');
        if (answer) data.items[0].standards = [{ metric: '待决定的设备数量', kind: 'quantity', value: '3', unit: '台', status: 'user_stated', verification: '还需要业主明确数量。', evidence: evidence(`answer:${answer.id}`, answer.answer) }];
      }
      if (scenario === 'intake-previous-number') {
        const previous = payload.input.previousItems[0];
        data.items[0].standards = [{ metric: '前次建议中的线路规格', kind: 'professional', value: '4', unit: 'mm²', status: 'user_stated', verification: '必须由专业人员核实。', evidence: evidence(`previous:${previous.id}`, previous.description) }];
      }
    }
    if (scenario === 'bad-schema') data = { notTheExpectedSchema: true };
    return send(res, 200, {
      id: 'simulated-completion', object: 'chat.completion', model: body.model,
      choices: [{ index: 0, finish_reason: scenario === 'truncated' ? 'length' : 'stop', message: {
        role: 'assistant', content: scenario === 'empty' ? '    ' : scenario === 'bad-json' ? '{invalid-json' : JSON.stringify(data),
        refusal: scenario === 'refused' ? 'Synthetic refusal' : null,
      } }],
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
    });
  } catch {
    return send(res, 500, { error: 'Local simulation handler error' });
  }
}).listen(process.env.PORT || 5202);
