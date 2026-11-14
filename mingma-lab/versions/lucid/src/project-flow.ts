export const projectSteps = ['planning', 'clarify', 'requirements', 'compare', 'space', 'records'] as const
export type ProjectStep = typeof projectSteps[number]
export type ProjectPage = ProjectStep | 'overview' | 'vendor' | 'assessment'
export type FlowEvidence = { planningChosen: boolean; requirements: number; published: number; proposals: number; selected: boolean }

/** Unlocks are monotonic within a project: returning to an earlier step does not relock later ones. */
export function unlockedStep(previous: number, evidence: FlowEvidence): number {
  const reached = evidence.selected ? 6 : evidence.proposals ? 5 : evidence.published ? 4 : evidence.requirements ? 3 : evidence.planningChosen ? 2 : 1
  return Math.max(previous, reached)
}
export function canVisit(page: string, unlocked: number): page is ProjectPage {
  if (page === 'overview') return true
  if (page === 'assessment') return unlocked >= 3
  if (page === 'vendor') return unlocked >= 4
  const index = projectSteps.indexOf(page as ProjectStep)
  return index >= 0 && index < unlocked
}
export const stepInstructions: Record<ProjectStep, string> = {
  planning: '生成户型并选择房间，再点“下一步 · 进入区域规划”，也可以先说全屋需求。',
  clarify: '先描述想法，再逐题补充。确认问卷后进入“我的需求”。',
  requirements: '核对这份清单，点击“提交需求，等待方案”继续。',
  compare: '先查看商家方案，再对照你的需求；演示方案点击即可展示。',
  space: '查看工程层次。看完后回到方案对比，选择合适的方案。',
  records: '本次选择和待确认事项已留存，可以返回前面任意步骤查看。',
}
