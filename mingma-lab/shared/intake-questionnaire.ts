import type { IntakeItem, IntakeQuestion } from './intake-contract.ts'
import { adoptionIssues, editIntakeItem, type IntakeState } from './intake-state.ts'

export const nonAnswerChoices = ['暂不确定', '以上选项都不适合']
/** The owner flow always has a selectable exit, including malformed or older AI questions. */
export function choiceOnlyQuestion(question: IntakeQuestion): IntakeQuestion {
  const choices = question.options.map(option => /其他|自行填写|请填写|请补充|请描述|自定义/.test(option) ? nonAnswerChoices[1] : option)
  return { ...question, options: [...new Set([...choices.filter(option => option.trim() && !nonAnswerChoices.includes(option)).slice(0, 6), ...nonAnswerChoices])] }
}

export function choiceOnlyAnswer(question: IntakeQuestion, selected: string[]) {
  const values = [...new Set(selected)].filter(choice => question.options.includes(choice))
  const deferred = values.find(choice => nonAnswerChoices.includes(choice))
  return { answer: deferred || (question.allowMultiple ? values : values.slice(0, 1)).join('、'), disposition: deferred ? 'deferred' as const : 'answered' as const }
}

export function questionnaireReply(question: IntakeQuestion, answer = ''): IntakeState['reply'] {
  if (question.options.includes(answer)) return { questionId: question.id, selected: [answer], free: '' }
  const [choices, ...supplement] = answer.split('；补充：')
  const options = [...question.options].filter(Boolean).sort((a, b) => b.length - a.length)
  const failed = new Set<string>()
  function match(text: string): string[] | undefined {
    if (failed.has(text)) return
    for (const option of options) {
      if (text === option) return [option]
      if (!question.allowMultiple || !text.startsWith(option + '、')) continue
      const rest = match(text.slice(option.length + 1))
      if (rest) return [option, ...rest]
    }
    failed.add(text)
  }
  const selected = match(choices)
  return { questionId: question.id, selected: selected || [], free: selected ? supplement.join('；补充：') : answer }
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
