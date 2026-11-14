// Isolated Vite 5213 -> real API 5203 -> existing Postman provider simulation 5204.
// Start with a fresh kitchen questionnaire via the visible "重新填写本轮问卷" action if needed.
return (async () => {
  if (location.origin !== 'http://127.0.0.1:5213') throw Error('Use the isolated Postman-backed QA app')
  const checks = [], visited = []
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const until = async (fn, label) => { for (let n = 0; n < 120; n++) { if (fn()) return; await wait(100) } throw Error(label) }
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  const click = async selector => { const el = document.querySelector(selector); if (!el || el.disabled) throw Error(`Unavailable ${selector}`); el.click(); await wait(60) }
  const next = () => click('[data-action="workflow-next"]')
  const back = () => click('[data-action="workflow-back"]')
  const answer = (q, value) => click(`[data-preference-question="${q}"][value="${value}"]`)
  const qid = () => document.querySelector('[data-preference-question]')?.dataset.preferenceQuestion
  const noWriting = () => !document.querySelector('#intake-root textarea, #intake-root input:not([type=checkbox]):not([type=radio]), #intake-root [contenteditable=true]')
  const count = () => document.querySelector('.preference-progress progress').max
  check(noWriting(), 'Room selection contains no written-answer field')
  check(!!document.querySelector('.preference-room-grid'), 'Starts with real room choices')
  check(!document.querySelector('#intake-brief'), 'No mandatory essay at entry')
  check(getComputedStyle(document.querySelector('.preference-actions')).display === 'none', 'One visible shared navigation bar')
  await next()
  check(qid() === 'goals', 'Room goals are first')
  await next()
  check(qid() === 'users', 'Next with an empty answer keeps the previous question pending')
  await back()
  const detail = document.querySelector('[data-preference-detail]')
  detail.value = '保留旧木地板'
  detail.dispatchEvent(new Event('input', { bubbles: true }))
  check(detail === document.querySelector('[data-preference-detail]') && !document.querySelector('[data-preference-question][value=unknown]'), 'Input replaces the uncertainty card and stays mounted while typing')
  await next(); await back()
  check(document.querySelector('[data-preference-detail]').value === '保留旧木地板', 'Input survives a return to the question')
  await answer('goals', 'appliance'); await answer('goals', 'storage'); await answer('goals', 'floor')
  check(count() > 15, 'Chosen goals unfold a deeper questionnaire')
  check(document.querySelectorAll('.preference-groups button').length === 3, 'Three groups show local progress')
  const replies = {
    users:['adult'], usage:['daily','together'], pain:['counter'], extent:['refresh'],
    'floor-hardness':['4'], 'floor-cleaning':['5'], 'floor-slip':['unknown'],
    appliance:['dishwasher'], 'floor-usage':['barefoot'], 'floor-material':['samples'], 'cleaning-trouble':['seams'],
    'storage-items':['appliances'], 'storage-problem':['reach'], 'storage-access':['mixed'], 'storage-power':['in-place'],
    'cooking-workflow':['wash-prep'], 'counter-space':['two'], 'dishwasher-use':['pots'],
    retention:['doors'], 'retention-boundary':['repair'], priority:['appliance'], tradeoff:['crowded'],
  }
  await next()
  for (let n = 0; n < 70 && !document.querySelector('.preference-summary'); n++) {
    const id = qid(); if (!id) throw Error('Missing question')
    check(document.querySelectorAll('[data-preference-detail]').length === 1, 'One optional field for '+id)
    visited.push(id)
    for (const value of replies[id] || []) if (value !== 'unknown') await answer(id, value)
    if (id === 'floor-hardness') {
      check(document.querySelectorAll('.preference-level').length === 5, 'Five-level scale remains available')
      await next(); await back()
      check(document.querySelector('[value="4"]').checked, 'Previous answer remains selected')
    }
    await next()
  }
  for (const id of ['usage','pain','cleaning-trouble','storage-items','storage-problem','storage-access','storage-power','cooking-workflow','dishwasher-use','retention-boundary','priority','tradeoff']) check(visited.includes(id), `Reached relevant branch: ${id}`)
  check(!visited.includes('shower') && !visited.includes('oven-use'), 'Unselected room and appliance branches stay hidden')
  check(document.querySelector('.preference-progress progress').value === count(), 'Progress equals the actual answered total')
  const summary = document.querySelector('.preference-summary').textContent
  check(summary.includes('锅具等大件清洗') && summary.includes('有空间但不容易拿') && summary.includes('4/5（稍硬实）'), 'Summary retains concrete use cases and subjective scale meaning')
  check(noWriting(), 'Preference summary has no optional writing field')
  const originalCount = count()
  await click('.preference-summary [data-intake-action="preference-edit"][data-intake-id="1"]')
  await answer('goals','floor')
  check(count() < originalCount, 'Changing a goal removes irrelevant follow-ups from the progress')
  await answer('goals','floor')
  await back()
  await click('[data-intake-action="preference-room"][data-intake-id="bedroom"]')
  if (!document.querySelector('.preference-room-grid')) throw Error('Use a fresh bedroom QA draft')
  await next()
  check(!!document.querySelector('[value="quiet"]') && !document.querySelector('[value="appliance"]'), 'Room-specific goals switch with the room')
  await back(); await click('[data-intake-action="preference-room"][data-intake-id="kitchen"]'); await next()
  check(document.querySelector('[value="appliance"]').checked && document.querySelector('[value="storage"]').checked, 'Room switch preserves the independent draft')
  for (let n = 0; n < 70 && !document.querySelector('.preference-summary'); n++) await next()
  const originalFetch = window.fetch; let payload
  window.fetch = (url, init) => { if (String(url).includes('/api/ai/intake')) payload = JSON.parse(init.body); return originalFetch(url, init) }
  try {
    await next()
    await until(() => document.querySelector('[data-intake-choice]') || document.querySelector('[data-intake-request-status="error"]'), 'AI API completes')
    check(!document.querySelector('[data-intake-request-status="error"]'), 'Expanded choices pass the real API through the Postman dependency')
    check(payload.areas.join() === '厨房' && payload.brief.includes('锅具等大件清洗') && payload.brief.includes('原位使用或充电') && payload.brief.includes('保留旧木地板'), 'Request contains room-specific second-level details')
    check(payload.brief.length <= 4000 && payload.brief.includes('主观偏好，不是工程参数'), 'Expanded payload fits the contract and keeps preference semantics')
  } finally { window.fetch = originalFetch }
  check(noWriting(), 'AI follow-up has no free-answer field')
  check(!!document.querySelector('[data-intake-choice="以上选项都不适合"]'), 'AI follow-up includes a selectable mismatch exit')
  await click('[data-intake-choice="油污擦拭"]'); await next()
  check(noWriting(), 'History and second follow-up remain choice-only')
  await back()
  check(document.querySelector('[data-intake-choice="油污擦拭"]').checked, 'Previous AI choice restores without free text')
  await next(); await click('[data-intake-choice="交界自然"]'); await next()
  await until(() => document.querySelector('[data-intake-item]'), 'Review arrives')
  check(noWriting(), 'Requirement review has no text editor or written decision form')
  for (let n = 0; n < 10 && !document.querySelector('.questionnaire-summary'); n++) {
    const necessity = document.querySelector('[data-intake-edit="necessity"]')?.value
    if (['undecided','excluded'].includes(necessity)) await click('[data-intake-action="review-defer"]')
    else await next()
  }
  check(!!document.querySelector('.questionnaire-summary') && noWriting(), 'Final submission requires only choices and confirmation')
  const replace = document.querySelector('[data-intake-field="replace"]')
  if (replace && !replace.checked) await click('[data-intake-field="replace"]')
  await next()
  await until(() => location.hash === '#planning', 'Room saved and returned to planning')
  check(document.querySelector('[data-action="room-work-open"][data-id="kitchen"]').textContent.includes('已整理'), 'Entire questionnaire completes with no typed answer')
  check(document.documentElement.scrollWidth <= innerWidth, 'Desktop has no horizontal overflow')
  return { passed: checks.length, checks, questionsVisited: visited.length + 1, upstream: 'Postman simulation' }
})()
