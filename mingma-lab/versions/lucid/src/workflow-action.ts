import type { ProjectPage } from './project-flow.ts'

export type WorkflowFacts = {
  page: ProjectPage
  planningStage?: string
  recognizing?: boolean
  roomCount: number
  roomName?: string
  requirementCount: number
  published: boolean
  dirty: boolean
  contextChanged: boolean
  insight?: 'loading' | 'complete' | 'error'
  currentProposal: boolean
  currentSelection: boolean
  choosingProposal: boolean
}
export type WorkflowAction = 'generate' | 'wait-planning' | 'need-rooms' | 'enter-room' | 'return-model' | 'intake' | 'clarify' | 'publish' | 'compare' | 'need-proposal' | 'space' | 'choose-proposal' | 'records' | 'overview' | 'assessment' | 'vendor'
export type WorkflowTask = { action: WorkflowAction; title: string; description: string; nextLabel: string; busy?: boolean }

/** Describes the next real operation, never fabricates a completed decision. */
export function workflowTask(facts: WorkflowFacts): WorkflowTask {
  const task = (action: WorkflowAction, title: string, description: string, nextLabel = '下一步', busy = false) => ({ action, title, description, nextLabel, busy })
  switch (facts.page) {
    case 'planning':
      if (facts.recognizing || facts.planningStage === 'building') return task('wait-planning', facts.recognizing ? '正在识别户型' : '正在生成立体户型', '完成后，在这里继续选择改造空间。', '处理中…', true)
      if (facts.planningStage === 'walls') return task('return-model', '墙体查看是辅助操作', '看完后返回户型，继续说明你的改造想法。', '下一步 · 返回户型')
      if (!facts.roomCount) return task('need-rooms', '先补充一个房间', '识别或手工标注房间后，就可以生成户型。', '下一步 · 生成户型')
      if (facts.planningStage !== 'model') return task('generate', '先把图纸变成立体户型', '可以上传自己的图纸，也可以直接使用当前演示户型。', '下一步 · 生成户型')
      return task('enter-room', `当前选中：${facts.roomName || '房间'}`, '点房间可以切换；下一步聊聊这个空间的改造想法。', '下一步 · 说说需求')
    case 'clarify': return task('intake', '先说说你的想法', '不需要懂装修术语，从生活中不方便的地方说起。')
    case 'requirements':
      if (facts.insight) return task('compare', facts.insight === 'loading' ? 'Flash 正在复核需求' : facts.insight === 'error' ? '需求已保存，分析可以稍后重试' : '需求分析已完成', '图谱可随时回看，也可以继续查看方案。', '下一步 · 查看方案')
      if (!facts.requirementCount || facts.contextChanged) return task('clarify', facts.contextChanged ? '项目背景已变化' : '先形成一份需求清单', facts.contextChanged ? '回到共创整理最新信息，已有发布版本会保留。' : '先说说改造想法，再逐条确认。', '下一步 · 整理需求')
      if (!facts.published || facts.dirty) return task('publish', '核对这些描述是不是你的意思', '现场尺寸可以待确认；下一步先确认发布，再由 Flash 分析。', '下一步 · 提交需求')
      return task('compare', '需求已提交', '接下来看看方案怎样回应你的清单。', '下一步 · 查看方案')
    case 'compare':
      if (!facts.currentProposal) return task('need-proposal', '先打开一份当前需求的方案', '点击方案卡片查看具体回应；当前提供的是演示方案。', '下一步 · 查看空间')
      if (facts.choosingProposal && !facts.currentSelection) return task('choose-proposal', '请选择你想进一步确认的方案', '在对应方案下点击“查看并选择此方案”，核对待办后再确认。', '下一步 · 确认选择')
      if (facts.currentSelection) return task('records', '已保留你的方案选择', '查看确认记录与尚待处理的事项。', '下一步 · 查看记录')
      return task('space', '先看关键差异，再对应到房间', '下一步把需求放回你的户型中核对。', '下一步 · 查看空间')
    case 'space': return facts.currentSelection
      ? task('records', '空间与需求已可对照', '继续查看已经保存的方案选择与待办。', '下一步 · 查看记录')
      : task('choose-proposal', '看完空间，回到方案做选择', '选定哪份方案由你决定；下一步定位到方案选择处。', '下一步 · 选择方案')
    case 'records': return facts.currentSelection
      ? task('overview', '本次选择和待办已经留存', '需要留存报告时，可使用右上角的导出项目。', '返回项目概览')
      : task('choose-proposal', '还需要确认当前需求的方案', '返回方案对比选择；历史记录仍然保留。', '返回方案选择')
    case 'assessment': return task('assessment', '先看需要处理的问题', '现场待测不必全部填完；影响确认的问题会定位到具体事项。', '返回主流程')
    case 'vendor': return task('vendor', '写清楚方案如何回应需求', '声明“已回应”的条目需要具体做法；提交后保留旧版。', '提交方案并继续')
    default: return task('clarify', '开始规划你的家', '从空间和生活想法开始。')
  }
}
