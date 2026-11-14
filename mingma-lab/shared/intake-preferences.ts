import type { PlanningModel } from './planning-floorplan.ts'
import { lifestyleQuestions, deepPreferenceQuestions, boundaryQuestions } from './intake-preference-depth.ts'

export type PreferenceDraft = { version: 1; flowVersion?: 2; stepId?: string; roomId: string; cursor: number; answers: Record<string, string[]>; note: string; details?: Record<string, string>; includeNote?: boolean }
export type PreferenceOption = { id: string; label: string; detail?: string }
export type PreferenceQuestion = { id: string; title: string; hint: string; group?: 'basics' | 'details' | 'boundaries'; multiple?: boolean; scale?: boolean; options: PreferenceOption[] }
export const preferenceGroups = { basics: '生活与现状', details: '功能细节', boundaries: '取舍与保留' } as const
export type PreferenceRoom = { id: string; name: string }
const unsure: PreferenceOption = { id: 'unknown', label: '暂不确定', detail: '保留为待确认，不替你做决定' }
const choices = (items: [string, string, string?][]): PreferenceOption[] => items.map(([id, label, detail]) => ({ id, label, detail }))
const question = (id: string, title: string, options: PreferenceOption[], multiple = false, hint = ''): PreferenceQuestion => ({ id, title, options: [...options, unsure], multiple, hint: hint || (multiple ? '可多选，选出这次真正想改善的部分。' : '选择最符合你想法的一项。') })
const scale = (id: string, title: string, labels: string[], hint: string): PreferenceQuestion => ({ id, title, hint, scale: true, options: [...labels.map((label, i) => ({ id: String(i + 1), label })), unsure] })

export function newPreferences(roomId = '', note = ''): PreferenceDraft { return { version: 1, flowVersion: 2, stepId: 'rooms', roomId, cursor: 0, answers: {}, note } }
export const preferenceDetailLimit = 80
const questionId = /^[a-z][a-z0-9-]{0,50}$/

export function validPreferences(value: unknown): value is PreferenceDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as PreferenceDraft
  if (v.details !== undefined && (!v.details || typeof v.details !== 'object' || Array.isArray(v.details) ||
    Object.keys(v.details).length > 100 || !Object.entries(v.details).every(([id, detail]) =>
      questionId.test(id) && typeof detail === 'string' && detail.length <= preferenceDetailLimit))) return false
  return v.version === 1 && (v.includeNote === undefined || typeof v.includeNote === 'boolean') && (v.flowVersion === undefined || v.flowVersion === 2) && (v.stepId === undefined || (typeof v.stepId === 'string' && /^[a-z][a-z0-9-]{0,50}$/.test(v.stepId))) && typeof v.roomId === 'string' && v.roomId.length <= 128 && Number.isInteger(v.cursor) && v.cursor >= 0 && v.cursor <= 100 && typeof v.note === 'string' && v.note.length <= 4000 &&
    !!v.answers && typeof v.answers === 'object' && !Array.isArray(v.answers) && Object.keys(v.answers).length <= 100 && Object.entries(v.answers).every(([key, values]) => /^[a-z][a-z0-9-]{0,50}$/.test(key) && Array.isArray(values) && values.length <= 20 && values.every(s => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s)))
}
export function roomKind(name: string) {
  if (/卫生间|卫浴|浴室|厕所|bath/i.test(name)) return 'bathroom'
  if (/厨房|厨|kitchen/i.test(name)) return 'kitchen'
  if (/卧|儿童房|老人房|bedroom/i.test(name)) return 'bedroom'
  if (/客厅|起居|living/i.test(name)) return 'living'
  if (/餐厅|dining/i.test(name)) return 'dining'
  if (/玄关|门厅|入户|entry/i.test(name)) return 'entry'
  if (/阳台|balcony/i.test(name)) return 'balcony'
  if (/书房|study|office/i.test(name)) return 'study'
  return 'general'
}
export function preferenceRooms(model?: PlanningModel): PreferenceRoom[] {
  return [...(model?.rooms || []), { id: 'whole-home', name: '全屋与公共需求' }].map(({ id, name }) => ({ id, name }))
}
const furnitureLabels: Record<string, string> = { bed: '床', sofa: '沙发', table: '桌子', chair: '椅子', cabinet: '柜体', counter: '台面', sink: '水槽', stove: '灶台', toilet: '马桶', bathtub: '浴缸', shower: '淋浴区', washer: '洗衣机', fridge: '冰箱' }
export function observedFurniture(model: PlanningModel | undefined, roomId: string) {
  return model?.recognized ? [...new Set((model.furniture || []).filter(f => f.roomId === roomId).map(f => f.kind))] : []
}
export function preferenceContext(model: PlanningModel | undefined, room: PreferenceRoom) {
  if (room.id === 'whole-home') return '先选择全屋的共同偏好，各房间的细节可以分别整理。'
  const seen = observedFurniture(model, room.id)
  if (seen.length) return `图纸识别提示：${seen.map(kind => furnitureLabels[kind]).join('、')}。请核对是否存在，再选择保留意向。`
  return model?.drawing ? '已按图纸中的房间名称匹配选项；家具、尺寸与现场条件仍需核对。' : '按当前房间匹配选项。演示户型中的家具不代表你家的实际情况。'
}
export function preferenceQuestions(room: PreferenceRoom, draft: PreferenceDraft, model?: PlanningModel): PreferenceQuestion[] {
  const kind = roomKind(room.name)
  const goals: Record<string, [string, string, string?][]> = {
    bathroom: [['floor', '地面防滑、好清理'], ['shower', '干湿分离', '减少洗澡时的水花外溅'], ['storage', '洗漱与收纳'], ['lighting', '照明与通风']],
    kitchen: [['floor', '地面好清理'], ['counter', '台面与橱柜'], ['appliance', '家电与使用动线'], ['storage', '增加收纳'], ['lighting', '操作照明与插座']],
    bedroom: [['floor', '地板与脚感'], ['quiet', '隔音与睡眠'], ['storage', '衣物收纳'], ['lighting', '床边照明与插座']],
    living: [['floor', '地面与脚感'], ['layout', '活动空间与通道'], ['storage', '杂物收纳'], ['lighting', '照明与影音插座']],
    dining: [['floor', '地面好打理'], ['layout', '就餐动线'], ['storage', '餐边收纳'], ['lighting', '餐桌照明']],
    entry: [['floor', '地面耐脏易清理'], ['storage', '鞋包与外套收纳'], ['seat', '坐着换鞋'], ['lighting', '入户照明']],
    balcony: [['floor', '地面防滑'], ['laundry', '洗衣与晾晒'], ['storage', '家政收纳'], ['leisure', '休闲活动']],
    study: [['floor', '地面脚感'], ['quiet', '安静工作'], ['storage', '书籍收纳'], ['lighting', '阅读照明与插座']],
    general: [['floor', '地面与空间衔接'], ['wall', '墙面与布局'], ['storage', '收纳与通道'], ['lighting', '照明与插座']],
  }
  const selected = draft.answers.goals || []
  const questions = [question('goals', `${room.name}，这次想改善哪些地方？`, choices(goals[kind]), true),
    question('users', '谁会经常使用这个空间？', choices([['adult', '成年人'], ['child', '儿童'], ['senior', '长辈'], ['mobility', '行动不便的家人'], ['pet', '宠物']]), true),
    ...lifestyleQuestions(kind),
    question('extent', '你希望改动到什么程度？', choices([['refresh', '局部更新', '尽量保留现有布局'], ['renovate', '整体翻新', '重新考虑材料与功能'], ['compare', '先比较方案', '先了解不同改法，再决定范围']]))]
  if (selected.includes('floor')) {
    questions.push(scale('floor-hardness', '地面踩上去，你更喜欢哪种软硬感？', ['偏柔软', '稍柔软', '适中', '稍硬实', '偏硬实'], '1 偏柔软 → 5 偏硬实。这是脚感偏好，不是材料硬度或质量评分。'))
    questions.push(scale('floor-cleaning', '地面容易清洁，对你有多重要？', ['不太在意', '较少在意', '一般', '比较重视', '非常重视'], '1 不太在意 → 5 非常重视；数值只表示你的重视程度。'))
    if (['bathroom', 'kitchen', 'balcony', 'entry'].includes(kind) || (draft.answers.users || []).some(v => ['child', 'senior', 'mobility'].includes(v))) {
      questions.push(scale('floor-slip', '你有多在意地面的防滑表现？', ['不太在意', '较少在意', '一般', '比较重视', '非常重视'], '这是使用偏好，实际材料的防滑性能需要另行核对。'))
    }
  }
  if (kind === 'bathroom' && selected.includes('shower')) questions.push(question('shower', '你更倾向哪种干湿分离方式？', choices([['screen', '玻璃隔断'], ['curtain', '浴帘分隔'], ['separate', '洗漱区与淋浴区分开'], ['keep', '保留现状']]), false, '先选倾向，空间、排水与安装条件由后续方案核对。'))
  if (kind === 'kitchen' && selected.includes('appliance')) questions.push(question('appliance', '哪些厨房设备需要在方案中考虑？', choices([['dishwasher', '洗碗机'], ['oven', '蒸烤箱'], ['fridge', '冰箱'], ['water', '净水设备']]), true))
  if (selected.includes('quiet')) questions.push(scale('quiet', '安静程度，对你有多重要？', ['不太在意', '较少在意', '一般', '比较重视', '非常重视'], '只记录重视程度，隔音效果与现场噪声需要后续核实。'))
  questions.push(...deepPreferenceQuestions(kind, draft))
  const seen = observedFurniture(model, room.id)
  questions.push(question('retention', '哪些现有部分，你希望尽量保留？', [
    ...choices([['layout', '现有布局'], ['floor', '现有地面'], ['doors', '门窗'], ['furniture', '现有家具与柜体']]),
    ...seen.map(kind => ({ id: `seen-${kind}`, label: furnitureLabels[kind], detail: '图纸识别提示，请核对' })),
    { id: 'none', label: '没有特别要保留的' },
  ], true, '可多选；保留意向会带入需求清单。未画出的家具也可选“现有家具与柜体”。'))
  questions.push(...boundaryQuestions(draft, questions[0].options))
  return questions.map(q => ({ ...q, group: ['goals', 'users', 'usage', 'pain', 'extent'].includes(q.id) ? 'basics' : ['retention', 'retention-boundary', 'priority', 'tradeoff'].includes(q.id) ? 'boundaries' : 'details' }))
}

/** Keep the same question when an existing draft resumes against the deeper catalog. */
export function restorePreferencePosition(draft: PreferenceDraft, room: PreferenceRoom, model?: PlanningModel): PreferenceDraft {
  const questions = preferenceQuestions(room, draft, model)
  let stepId = draft.stepId
  if (!draft.flowVersion) {
    const legacyIds = new Set(['goals', 'users', 'extent', 'floor-hardness', 'floor-cleaning', 'floor-slip', 'shower', 'appliance', 'quiet', 'retention'])
    const legacy = questions.filter(q => legacyIds.has(q.id))
    stepId = draft.cursor === 0 ? 'rooms' : draft.cursor > legacy.length ? 'summary' : legacy[draft.cursor - 1].id
  }
  const cursor = stepId === 'rooms' ? 0 : stepId === 'summary' ? questions.length + 1 : stepId && questions.some(q => q.id === stepId) ? questions.findIndex(q => q.id === stepId) + 1 : Math.min(draft.cursor, questions.length + 1)
  return { ...draft, flowVersion: 2, cursor, stepId: cursor === 0 ? 'rooms' : cursor > questions.length ? 'summary' : questions[cursor - 1].id }
}
export function selectedPreferences(question: PreferenceQuestion, draft: PreferenceDraft) {
  const selected = question.options.filter(option => (draft.answers[question.id] || []).includes(option.id))
  const exclusive = selected.find(o => ['unknown', 'none'].includes(o.id))
  return exclusive ? [exclusive] : question.multiple ? selected : selected.slice(0, 1)
}
export function selectPreference(draft: PreferenceDraft, q: PreferenceQuestion, value: string, checked: boolean): PreferenceDraft {
  if (!q.options.some(o => o.id === value)) return draft
  const exclusive = ['unknown', 'none']
  const previous = draft.answers[q.id] || []
  const values = !checked ? previous.filter(v => v !== value) : !q.multiple || exclusive.includes(value) ? [value] : [...new Set([...previous.filter(v => !exclusive.includes(v)), value])]
  return { ...draft, answers: { ...draft.answers, [q.id]: values } }
}
export function preferenceAnswered(question: PreferenceQuestion, draft: PreferenceDraft) {
  return Boolean(selectedPreferences(question, draft).length || draft.details?.[question.id]?.trim())
}

export function preferenceSummary(room: PreferenceRoom, draft: PreferenceDraft, model?: PlanningModel) {
  return preferenceQuestions(room, draft, model).map(q => {
    const detail = draft.details?.[q.id]?.trim()
    const options = selectedPreferences(q, draft).filter(o => !detail || o.id !== 'unknown')
    const selected = options.map(o => q.scale && o.id !== 'unknown' ? `${o.id}/5（${o.label}）` : o.label).join('、')
    const answer = [selected, detail ? `补充：${detail}` : ''].filter(Boolean).join('；')
    return { id: q.id, title: q.title, answer: answer || '尚未选择' }
  })
}
export function preferenceBrief(room: PreferenceRoom, draft: PreferenceDraft, model?: PlanningModel) {
  const rows = preferenceSummary(room, draft, model).filter(row => row.answer !== '尚未选择')
  return [`本次规划：${room.name}。以下是用户的选择和补充；1–5 级仅为主观偏好，不是工程参数或已核实性能。`, ...rows.map(row => `${row.title} ${row.answer}。`), draft.includeNote !== false && draft.note.trim() ? `用户历史记录：${draft.note.trim()}` : '', '未选择的内容不代表同意；图纸识别提示不代表现场确认。'].filter(Boolean).join('\n')
}
