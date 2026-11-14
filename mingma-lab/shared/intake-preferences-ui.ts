import { preferenceAnswered, preferenceDetailLimit, preferenceContext, preferenceGroups, preferenceQuestions, preferenceSummary, selectedPreferences, type PreferenceDraft, type PreferenceRoom } from './intake-preferences.ts'
import type { PlanningModel } from './planning-floorplan.ts'
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const button = (text: string, action: string, primary = false, extra = '') => `<button type="button" class="intake-button intake-button--${primary ? 'primary' : 'text'}" data-intake-action="${action}" ${extra}>${text}</button>`

export function preferencesMarkup(draft: PreferenceDraft, room: PreferenceRoom, rooms: PreferenceRoom[], model?: PlanningModel, busy = false) {
  const questions = preferenceQuestions(room, draft, model)
  const cursor = Math.min(draft.cursor, questions.length + 1)
  const q = questions[cursor - 1]
  const complete = questions.filter(q => preferenceAnswered(q, draft)).length
  const review = cursor > questions.length
  const groups = Object.entries(preferenceGroups).map(([id, label]) => ({ id, label, questions: questions.filter(q => q.group === id) })).filter(group => group.questions.length)
  const title = cursor === 0 ? '先选一个房间，从你在意的地方开始。' : q?.title || '这些选择，符合你的想法吗？'
  return `<section class="intake-panel intake-preferences" aria-labelledby="intake-expression-title">
    <div class="preference-progress"><span>${cursor === 0 ? '选择房间' : review ? '核对本轮选择' : `第 ${cursor} / ${questions.length} 题 · ${q?.scale ? '1–5 级' : q?.multiple ? '多选' : '单选'}`}</span><span data-preference-complete>已答 ${complete} / ${questions.length} 题</span><progress value="${complete}" max="${questions.length}" aria-label="房间偏好完成进度"></progress></div>
    ${cursor ? `<nav class="preference-groups" aria-label="房间偏好分组">${groups.map(group => { const done = group.questions.filter(q => preferenceAnswered(q, draft)).length; const first = group.questions.find(q => !preferenceAnswered(q, draft)) || group.questions[0]; return `<button type="button" data-intake-action="preference-edit" data-preference-group="${group.id}" data-intake-id="${questions.findIndex(q => q.id === first.id) + 1}" ${q?.group === group.id ? 'aria-current="step"' : ''} ${busy ? 'disabled' : ''}><span>${group.label}</span><small>${done} / ${group.questions.length}</small></button>` }).join('')}</nav>` : ''}
    <div class="intake-section-heading"><h2 id="intake-expression-title" tabindex="-1">${esc(title)}</h2><p>${esc(cursor === 0 ? '每个房间独立保存。从生活习惯到具体功能、再到取舍；题目会随你的选择继续展开。' : q?.hint || '可以按分组回去修改；确认后，AI 会据此整理需求并补充需要核对的细节。')}</p></div>
    <fieldset class="preference-fields" ${busy ? 'disabled' : ''}>
    <legend class="intake-sr">${esc(title)}</legend>
    ${cursor === 0 ? `<div class="preference-room-grid">${rooms.map(r => `<button type="button" class="preference-room" data-intake-action="preference-room" data-intake-id="${esc(r.id)}" aria-pressed="${r.id === room.id}"><span>${esc(r.name)}</span><small>${r.id === room.id ? '当前选择' : r.id === 'whole-home' ? '共同偏好与空间衔接' : '整理这个房间'}</small></button>`).join('')}</div>` : q ? `<div class="preference-options ${q.scale ? 'preference-scale' : ''}">${q.options.filter(o => o.id !== 'unknown').map(o => `<label class="preference-option"><input type="${q.multiple ? 'checkbox' : 'radio'}" name="preference-${q.id}" id="preference-${q.id}-${o.id}" data-preference-question="${q.id}" value="${o.id}" ${selectedPreferences(q, draft).some(s => s.id === o.id) ? 'checked' : ''}/>${q.scale ? `<span class="preference-level">${o.id}</span>` : ''}<span class="preference-option-text"><strong>${esc(o.label)}</strong>${o.detail && !q.scale ? `<small>${esc(o.detail)}</small>` : ''}</span><svg class="preference-tick" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg></label>`).join('')}</div>
      <label class="preference-detail" for="preference-detail">
        <span>补充这题 <small>选填</small></span>
        <input id="preference-detail" type="text" maxlength="${preferenceDetailLimit}" data-preference-detail="${q.id}" value="${esc(draft.details?.[q.id])}" placeholder="可以写选项未涵盖的需求，或还不确定的地方"/>
      </label>` : `<ol class="preference-summary">${preferenceSummary(room, draft, model).map((row, i) => `<li><div><span>${esc(row.title)}</span><strong>${esc(row.answer)}</strong></div>${button('修改', 'preference-edit', false, `data-intake-id="${i + 1}" aria-label="修改：${esc(row.title)}"`)}</li>`).join('')}</ol>`}
    </fieldset>
    ${cursor === 0 || q?.id === 'retention' ? `<p class="preference-context">${esc(preferenceContext(model, room))}</p>` : ''}
    ${(review || cursor === 0) && draft.note ? `<details class="preference-note"><summary>查看历史文字记录</summary><p class="preference-history-note">${esc(draft.note)}</p><label class="intake-check"><input id="preference-include-note" type="checkbox" data-intake-field="include-note" ${draft.includeNote !== false ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>本轮继续参考这段历史记录</span></label></details>` : ''}
    <div class="intake-action-row preference-actions">${cursor ? button('上一步', 'preference-back') : '<span>不确定的题目也可以继续，稍后再核对。</span>'}${button(review ? '确认选择，整理需求' : cursor === 0 ? '开始选择偏好' : '下一题', 'preference-next', true, busy ? 'disabled' : '')}</div>
  </section>`
}
