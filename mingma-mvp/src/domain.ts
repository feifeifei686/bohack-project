/** Browser-local demo rules. These functions do not call an AI service or verify construction feasibility. */
export type Priority = 'must' | 'prefer'
export type Answers = { layout: string; devices: string[]; cleaning: string; cabinet: string; window: string }
export type Requirement = {
  id: string; title: string; description: string; room: string; category: string
  priority: Priority; source: string; pending: string[]
}
export type ProposalItem = {
  requirementId: string; commitment: 'yes' | 'partial' | 'no' | 'unknown'; text: string
}
export type Proposal = {
  id: string; vendorId: 'a' | 'b'; vendorName: string; version: number
  requirementVersion: number; items: ProposalItem[]; createdAt: string
}
export type Finding = {
  requirementId: string; status: 'responded' | 'partial' | 'conflict' | 'unknown'
  reason: string; evidence: string; action: string
}

const uncertain = (value: string) => !value.trim() || value.trim() === '暂不确定'
const unique = (items: string[]) => [...new Set(items.map(item => item.trim()).filter(Boolean))]

export function buildRequirements(_brief: string, answers: Answers): Requirement[] {
  // The questionnaire's uncertainty option is a response state, never a physical appliance.
  const devices = unique(answers.devices).filter(device => device !== '暂不确定')
  const countertop = devices.filter(device => device !== '洗碗机')
  const requirements: Requirement[] = []
  const add = (id: string, title: string, category: string, description: string, answer: string, pending: string[], priority: Priority = 'must') => {
    requirements.push({ id, title, room: '厨房', category, description, priority,
      source: answer ? `用户选择：${answer}` : '尚未回答，需用户确认', pending })
  }
  add('K01', '布局与保留项', '拆改',
    answers.layout === '保留现有布局' ? '保留现有水槽与冰箱位置；如需移动，先说明原因并由用户确认。' :
      answers.layout === '允许调整' ? '允许调整厨房布局；商家需说明水槽与冰箱的位置及调整理由。' : '厨房布局调整意愿待确认，暂不决定水槽与冰箱是否移动。',
    answers.layout, uncertain(answers.layout) ? ['需用户确认是否调整布局', '现有位置待现场核实'] : ['现有位置待现场核实'])
  if (devices.includes('洗碗机')) {
    add('K02', '洗碗机与配套', '水电与安装', '预留洗碗机安装位，分别说明供水、排水与电源配套。', '计划增加洗碗机', ['设备型号与尺寸待确认', '现有供排水接口待现场核实'])
  }
  add('K03', '台面设备点位', '水电', countertop.length ? `为「${countertop.join('、')}」分别标注使用位置与对应电源点位。` : '台面设备清单尚未确定，需确认具体设备及对应点位。',
    countertop.join('、'), countertop.length ? ['实际用电条件与设备功率待专业复核'] : ['需用户补充台面设备清单', '实际用电条件待专业复核'])
  add('K04', '材料与日常清洁', '泥瓦与墙面',
    answers.cleaning === '容易擦拭、减少接缝' ? '墙面与台面优先容易擦拭、减少接缝；说明接缝处理、清洁方式与维护注意事项。' :
      answers.cleaning === '耐用优先' ? '墙面与台面优先耐用；说明材料选择依据、清洁方式与维护注意事项。' : '材料与清洁偏好待确认，先请商家说明材料和维护方式。',
    answers.cleaning, uncertain(answers.cleaning) ? ['需用户确认材料与清洁偏好'] : [], 'prefer')
  add('K05', '柜体收纳形式', '安装',
    answers.cabinet === '不要开放展示格' ? '不设置开放展示格；开放设备位如确有需要，另行确认。' :
      answers.cabinet === '接受开放展示格' ? '可以接受开放展示格；商家说明开放与封闭收纳的位置及用途，由用户选择。' : '开放或封闭收纳形式待用户确认。',
    answers.cabinet, uncertain(answers.cabinet) ? ['需用户确认柜体形式', '柜体尺寸待现场测量'] : ['柜体尺寸待现场测量'], answers.cabinet === '接受开放展示格' ? 'prefer' : 'must')
  add('K06', '厨房窗施工范围', '门窗',
    answers.window === '保留现有窗' ? '保留现有厨房窗，本次不包含换窗；发现问题时另行说明。' :
      answers.window === '考虑更换' ? '考虑更换厨房窗；商家说明现状、保留与更换两种做法，再由用户决定。' : '厨房窗是否更换待确认，未确认前不将换窗作为确定施工项。',
    answers.window, uncertain(answers.window) ? ['需用户确认门窗施工范围', '窗况待现场核实'] : ['窗况待现场核实'])
  return requirements
}

/** Only known generated descriptions are eligible for automatic demo coverage checks. Edited/custom text stays manual. */
function ruleFor(requirement: Requirement): string | null {
  const text = requirement.description
  switch (requirement.id) {
    case 'K01': return text === '保留现有水槽与冰箱位置；如需移动，先说明原因并由用户确认。' ? 'layout-keep' :
      text === '允许调整厨房布局；商家需说明水槽与冰箱的位置及调整理由。' ? 'layout-change' : null
    case 'K02': return text === '预留洗碗机安装位，分别说明供水、排水与电源配套。' ? 'dishwasher' : null
    case 'K03': return /^为「[^」]+」分别标注使用位置与对应电源点位。$/.test(text) ? 'devices' : null
    case 'K04': return text === '墙面与台面优先容易擦拭、减少接缝；说明接缝处理、清洁方式与维护注意事项。' ? 'cleaning' :
      text === '墙面与台面优先耐用；说明材料选择依据、清洁方式与维护注意事项。' ? 'durable' : null
    case 'K05': return text === '不设置开放展示格；开放设备位如确有需要，另行确认。' ? 'cabinet-closed' :
      text === '可以接受开放展示格；商家说明开放与封闭收纳的位置及用途，由用户选择。' ? 'cabinet-choice' : null
    case 'K06': return text === '保留现有厨房窗，本次不包含换窗；发现问题时另行说明。' ? 'window-keep' :
      text === '考虑更换厨房窗；商家说明现状、保留与更换两种做法，再由用户决定。' ? 'window-choice' : null
    default: return null
  }
}

function completeDemoText(requirement: Requirement): string | null {
  const rule = ruleFor(requirement)
  const texts: Record<string, string> = {
    'layout-keep': '保留现有水槽与冰箱位置，不移动原有布局。现有位置待现场核实，若确需调整将另行说明并取得用户确认。',
    'layout-change': '水槽与冰箱的位置可根据现场条件调整；调整理由为优化操作动线。提交位置示意后交用户选择，尺寸待现场核实。',
    dishwasher: '预留洗碗机安装位；列出供水接点、排水接点与独立电源点位的配套说明。型号、尺寸及现有接口待现场确认，本说明不代替施工图。',
    devices: '按设备清单分别标注使用位置与对应电源点位；实际用电条件待专业复核。',
    cleaning: '墙面与台面选择容易擦拭的材料，接缝采取收口处理。清洁方式为按所选材料说明进行日常擦拭，并提供维护注意事项；具体型号另行确认。',
    durable: '墙面与台面以耐用为材料选择目标；材料选定后提供依据、清洁方式和维护说明，供用户确认。',
    'cabinet-closed': '采用封闭式收纳，不设置开放展示格。开放设备位单独标注后另行确认，柜体尺寸待现场测量。',
    'cabinet-choice': '方案列出开放展示格与封闭收纳的位置及用途，作为可选项目交用户选择；柜体尺寸待现场测量。',
    'window-keep': '保留现有厨房窗，不更换厨房窗。本次施工范围不包含换窗，发现现场问题时另行说明。',
    'window-choice': '检查厨房窗现状，分别提供保留方案与更换方案及其使用影响，由用户最终决定，窗况待现场核实。',
  }
  if (!rule) return null
  if (rule === 'devices') {
    const list = requirement.description.match(/「([^」]+)」/)?.[1] ?? ''
    return `${list.split('、').map(device => `${device}：标注使用位置与对应电源点位`).join('；')}。实际用电条件与设备功率待专业复核。`
  }
  return texts[rule] ?? null
}

export function seedProposals(requirements: Requirement[], revision: number): Proposal[] {
  if (!Number.isInteger(revision) || revision < 1) throw new Error('请先发布有效的需求版本。')
  return (['a', 'b'] as const).map(vendorId => ({
    id: `${vendorId}-r${revision}-v1`, vendorId,
    vendorName: vendorId === 'a' ? '木序设计' : '栖居营造',
    version: 1, requirementVersion: revision, createdAt: new Date().toISOString(),
    items: requirements.map(requirement => {
      const complete = completeDemoText(requirement)
      if (vendorId === 'a' && requirement.id === 'K02' && complete) {
        return { requirementId: requirement.id, commitment: 'yes' as const, text: '橱柜中预留洗碗机安装位，并提供电源点位。供水与排水配套暂未说明。' }
      }
      if (vendorId === 'b' && ruleFor(requirement) === 'cabinet-closed') {
        return { requirementId: requirement.id, commitment: 'yes' as const, text: '吊柜一侧新增开放展示格，用于摆放杯具；其他区域采用封闭收纳。柜体尺寸待现场测量。' }
      }
      return { requirementId: requirement.id, commitment: complete ? 'yes' as const : 'unknown' as const,
        text: complete ?? '该需求尚未明确或不在当前规则覆盖范围，请用户与商家补充具体条件。' }
    }),
  }))
}

const pendingNote = (requirement: Requirement) => requirement.pending.length ? ` 待确认：${requirement.pending.join('；')}。` : ''
const clauses = (text: string) => text.split(/[，,。；;\n]/).map(part => part.trim()).filter(Boolean)
const unknownWords = /未说明|暂未|未提供|未包含|不包含|不提供|不配置|未配置|未预留|没有|缺少|待补充|暂缺|无(?:供水|给水|进水|排水|电源|插座)/
function includesFact(text: string, words: RegExp): boolean {
  return clauses(text).some(clause => words.test(clause) && !unknownWords.test(clause))
}
function knownContradiction(rule: string, text: string): string | null {
  const positive = text
    .replace(/(?:不|未)(?:移动|调整)(?:现有|原有)?(?:水槽|冰箱|布局)/g, '')
    .replace(/(?:不设置|不设|取消|移除|不保留)(?:任何)?开放展示格/g, '')
    .replace(/(?:不更换|不换|无需更换)(?:现有)?(?:厨房)?窗/g, '')
    .replace(/(?:不包含|不包括)(?:更换|换)(?:厨房)?窗/g, '')
  if (rule === 'cabinet-closed' && /(?:设置|新增|采用|保留|增设)开放展示格/.test(positive)) return '方案包含开放展示格，与用户明确的排除项冲突。'
  if (rule === 'layout-keep' && /(?:移动|迁移|移走)(?:现有|原有)?(?:水槽|冰箱)|重新布局/.test(positive)) return '方案明确移动原有设备或重新布局，需要用户先确认。'
  if (rule === 'window-keep' && /(?:更换|拆换)(?:现有)?(?:厨房)?窗|新增换窗/.test(positive)) return '方案包含换窗，与当前保留窗的需求冲突。'
  return null
}

function missingFor(requirement: Requirement, rule: string, text: string): string[] {
  const missing: string[] = []
  const need = (condition: boolean, label: string) => { if (!condition) missing.push(label) }
  switch (rule) {
    case 'layout-keep':
      need(includesFact(text, /保留.*水槽|水槽.*保留/), '保留水槽的位置说明')
      need(includesFact(text, /保留.*冰箱|冰箱.*保留/), '保留冰箱的位置说明')
      break
    case 'layout-change':
      need(includesFact(text, /水槽/) && includesFact(text, /冰箱/), '水槽与冰箱的位置说明')
      need(includesFact(text, /理由|原因|动线/), '调整理由')
      break
    case 'dishwasher':
      need(includesFact(text, /洗碗机.*(?:安装位|柜位|机位|设备位)/), '洗碗机安装位')
      need(includesFact(text, /供水|进水|给水/), '供水配套')
      need(includesFact(text, /排水/), '排水配套')
      need(includesFact(text, /电源|供电|插座/), '电源配套')
      break
    case 'devices': {
      const devices = requirement.description.match(/「([^」]+)」/)?.[1].split('、') ?? []
      for (const device of devices) need(clauses(text).some(clause => clause.includes(device) && /位置|点位/.test(clause) && /电源|供电|插座/.test(clause) && !unknownWords.test(clause)), `${device}的位置和电源点位`)
      break
    }
    case 'cleaning':
      need(includesFact(text, /擦拭|清洁/), '清洁方式')
      need(includesFact(text, /接缝/), '接缝处理')
      need(includesFact(text, /维护/), '维护说明')
      break
    case 'durable':
      need(includesFact(text, /耐用/), '耐用目标')
      need(includesFact(text, /清洁/) && includesFact(text, /维护/), '清洁与维护说明')
      break
    case 'cabinet-closed':
      need(/不设置开放展示格|不设开放展示格|取消开放展示格|移除开放展示格/.test(text), '明确不设置开放展示格')
      break
    case 'cabinet-choice':
      need(includesFact(text, /开放展示格/) && includesFact(text, /封闭/), '开放与封闭收纳的说明')
      need(includesFact(text, /位置/) && includesFact(text, /用途/), '位置与用途')
      break
    case 'window-keep':
      need(includesFact(text, /保留.*窗/), '保留厨房窗的说明')
      break
    case 'window-choice':
      need(includesFact(text, /保留/) && includesFact(text, /更换/), '保留和更换两种做法')
      need(includesFact(text, /现状|窗况/), '窗况说明')
  }
  return missing
}

export function reviewProposal(requirements: Requirement[], proposal: Proposal): Finding[] {
  return requirements.map(requirement => {
    const matches = proposal.items.filter(item => item.requirementId === requirement.id)
    const base = { requirementId: requirement.id, evidence: matches[0]?.text ?? '' }
    if (matches.length > 1) return { ...base, status: 'unknown', reason: '同一需求存在重复回应，无法确定以哪一条为准。', action: '请商家合并或明确有效回应。' }
    const item = matches[0]
    if (!item || !item.text.trim()) return { ...base, status: 'unknown', reason: '未找到可核对的方案原文。', action: '请商家补充该需求的具体做法及依据。' }
    if (item.commitment === 'no') return { ...base, status: 'conflict', reason: `商家明确选择无法回应该需求。${pendingNote(requirement)}`, action: '请商家说明限制和替代做法，由用户决定是否调整需求。' }
    if (item.commitment === 'unknown') return { ...base, status: 'unknown', reason: `商家标记为尚不确定。${pendingNote(requirement)}`, action: '补充资料后再核对，不视为已满足。' }
    const rule = ruleFor(requirement)
    if (!rule) return { ...base, status: 'unknown', reason: `该条为未定、编辑后或自定义需求，当前演示规则不作自动匹配判断。${pendingNote(requirement)}`, action: '请用户与商家逐项确认，保留人工核对记录。' }
    const conflict = knownContradiction(rule, item.text)
    if (conflict) return { ...base, status: 'conflict', reason: conflict, action: '退回修改，或提出替代方案交用户确认。' }
    const missing = missingFor(requirement, rule, item.text)
    if (missing.length || item.commitment === 'partial') return { ...base, status: 'partial',
      reason: (missing.length ? `规则未找到完整说明：${missing.join('、')}。` : '商家明确标记为部分回应，仍需补充未完成部分。') + pendingNote(requirement),
      action: missing.length ? `请补充${missing.join('、')}，然后重新核对。` : '请商家说明未回应部分与下一步。' }
    return { ...base, status: 'responded', reason: `商家已回应当前规则所检查的要点；此结果仅核对文字说明，不代表已验证施工可行性。${pendingNote(requirement)}`,
      action: requirement.pending.length ? '保留待确认清单，现场或专业复核后再决定。' : '请用户查看原文并确认做法。' }
  })
}

export function reviseDemoProposal(proposal: Proposal, requirements: Requirement[]): Proposal {
  const version = proposal.version + 1
  return {
    ...proposal, id: `${proposal.vendorId}-r${proposal.requirementVersion}-v${version}`,
    version, createdAt: new Date().toISOString(),
    items: requirements.map(requirement => {
      const complete = completeDemoText(requirement)
      const previous = proposal.items.find(item => item.requirementId === requirement.id)
      return complete ? { requirementId: requirement.id, commitment: 'yes', text: complete } :
        previous ? { ...previous } : { requirementId: requirement.id, commitment: 'unknown', text: '该需求需要人工补充与确认。' }
    }),
  }
}

const CSV_HEADER = ['requirementId', 'commitment', 'text']
const COMMITMENTS = new Set(['yes', 'partial', 'no', 'unknown'])
const MAX_CSV_LENGTH = 200_000
const MAX_TEXT_LENGTH = 5000

/** Small strict RFC-4180-style parser: quoted commas, line breaks and doubled quotes are supported. */
function readCsv(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closed = false
  const pushField = () => { row.push(field); field = ''; closed = false }
  const pushRow = () => { pushField(); rows.push(row); row = [] }
  const text = source.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const character = text[i]
    if (quoted) {
      if (character === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else { quoted = false; closed = true }
      } else field += character
      continue
    }
    if (closed && character !== ',' && character !== '\r' && character !== '\n') throw new Error('CSV 引号结束后存在多余字符。')
    if (character === '"') {
      if (field.length) throw new Error('CSV 字段中的引号需要使用双引号转义。')
      quoted = true
    } else if (character === ',') pushField()
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else field += character
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号。')
  if (field.length || row.length || closed) pushRow()
  return rows
}

export function parseProposalCsv(text: string, requirements: Requirement[]): ProposalItem[] {
  if (!text.trim()) throw new Error('文件为空，请填写方案后再导入。')
  if (text.length > MAX_CSV_LENGTH) throw new Error('CSV 内容过长，请控制在 20 万字符以内。')
  const rows = readCsv(text)
  if (!rows.length || rows[0].length !== CSV_HEADER.length || rows[0].some((value, i) => value !== CSV_HEADER[i])) {
    throw new Error('CSV 表头必须为 requirementId,commitment,text，请使用下载的模板。')
  }
  if (rows.length < 2) throw new Error('CSV 只有表头，请至少填写一条方案回应。')
  const known = new Set(requirements.map(requirement => requirement.id))
  const seen = new Set<string>()
  return rows.slice(1).map((row, index) => {
    const number = index + 2
    if (row.length !== 3) throw new Error(`CSV 第 ${number} 行应包含 3 个字段。`)
    const [requirementId, commitment, content] = row
    if (!requirementId.trim() || !commitment.trim() || !content.trim()) throw new Error(`CSV 第 ${number} 行存在空白字段。`)
    if (!known.has(requirementId)) throw new Error(`CSV 第 ${number} 行的需求编号不在当前需求清单中。`)
    if (seen.has(requirementId)) throw new Error(`CSV 存在重复需求编号 ${requirementId}，请每条需求保留一条回应。`)
    if (!COMMITMENTS.has(commitment)) throw new Error(`CSV 第 ${number} 行的 commitment 只能为 yes、partial、no 或 unknown。`)
    if (content.length > MAX_TEXT_LENGTH) throw new Error(`CSV 第 ${number} 行说明过长，最多 ${MAX_TEXT_LENGTH} 个字符。`)
    if (content.includes('\0')) throw new Error(`CSV 第 ${number} 行包含无效字符。`)
    seen.add(requirementId)
    return { requirementId, commitment: commitment as ProposalItem['commitment'], text: content }
  })
}

export function proposalCsv(items: ProposalItem[]): string {
  const escape = (text: string) => `"${text.replaceAll('"', '""')}"`
  return [CSV_HEADER.join(','), ...items.map(item => [item.requirementId, item.commitment, item.text].map(escape).join(','))].join('\r\n')
}
