import type { IntakeItem, IntakeQuestion } from './intake-contract.ts'
import { adoptionIssues, editIntakeItem, type IntakeState } from './intake-state.ts'

export function questionnaireReply(question: IntakeQuestion, answer = ''): IntakeState['reply'] {
  const [choices, ...supplement] = answer.split('；补充：')
  const selected = choices.split('、').filter(Boolean)
  const wasSelection = selected.length > 0 && selected.every(value => question.options.includes(value))
  return { questionId: question.id, selected: wasSelection ? selected : [], free: wasSelection ? supplement.join('；补充：') : answer }
}

/** Reuse the adoption rules; a friendly confirmation must never bypass them. */
export function questionnaireItemIssues(state: IntakeState, item: IntakeItem): string[] {
  if (['undecided', 'excluded'].includes(item.necessity)) return ['请选择重要程度，或点击“暂不纳入”。']
  return adoptionIssues({
    ...state,
    result: state.result && { ...state.result, items: [item], conflicts: state.result.conflicts.filter(c => c.itemIds.includes(item.id)) },
    reviewedIds: [item.id], acceptedSuggestionIds: [item.id],
  }, 0)
}

export function confirmQuestionnaireItem(state: IntakeState, id: string): IntakeState {
  const item = state.result?.items.find(item => item.id === id)
  if (!item) throw new Error('这条需求已更新，请重新查看。')
  const issues = questionnaireItemIssues(state, item)
  if (issues.length) throw new Error(issues[0])
  return {
    ...state,
    reviewedIds: [...new Set([...state.reviewedIds, id])],
    acceptedSuggestionIds: item.origin === 'suggestion' ? [...new Set([...state.acceptedSuggestionIds, id])] : state.acceptedSuggestionIds,
    revision: state.revision + 1,
  }
}

export function deferQuestionnaireItem(state: IntakeState, id: string): IntakeState {
  return editIntakeItem(state, id, { necessity: 'undecided' })
}
