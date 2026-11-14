// Run in an isolated QA browser. prepare -> full navigation/reload -> verify.
return (async () => {
  const variant = location.pathname.split('/').filter(Boolean)[1]
  if (!['atmosphere', 'lucid', 'atelier'].includes(variant)) throw Error('Open a lab variant')
  const key = `mingma-${variant}-v1`, scaleKey = `mingma-${variant}-dimensions-v1`, intakeKey = `mingma-${variant}-intake-v2`
  const phase = new URL(location.href).searchParams.get('hub-phase') || 'prepare'
  const checks = [], delay = () => new Promise(r => setTimeout(r, 90))
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  const until = async (fn, label) => { for (let n = 0; n < 160; n++) { if (fn()) return; await delay() } throw Error(label) }
  const click = async s => { const el = document.querySelector(s); if (!el) throw Error(`Missing ${s}`); el.click(); await delay() }
  const go = async p => { location.hash = p; await delay() }
  const fill = async (s, value) => { const el = document.querySelector(s); if (!el) throw Error(`Missing ${s}`); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await delay() }
  const project = () => JSON.parse(localStorage.getItem(key) || '{}')
  const intake = () => JSON.parse(localStorage.getItem(intakeKey) || '{}')
  if (phase === 'prepare') {
    await go('overview'); await click('[data-action="reset"]'); await click('[data-action="confirm-reset"]'); await click('[data-action="demo"]')
    const legacy = { O01: { maturity: 3, priority: '必须', evidence: '两人常住，每天做饭。' }, O08: { maturity: 2, priority: '偏好', evidence: '施工期间继续居住。' }, O09: { maturity: 3, priority: '可选', evidence: '希望先看清单，由我确认。' }, O02: { maturity: 2, priority: '必须', evidence: '旧的改造范围原文应完整保留。' }, M03: { maturity: 2, priority: '必须', evidence: '旧商家能力说明，未指定具体企业。' } }
    localStorage.setItem(scaleKey, JSON.stringify(legacy))
    sessionStorage.setItem(`hub-test-${variant}`, JSON.stringify({ legacy: JSON.stringify(legacy), snapshot: JSON.stringify(project().snapshots[0]) }))
    return { prepared: variant, next: 'Navigate with ?hub-phase=verify#dimensions to reload saved legacy records' }
  }
  const prior = JSON.parse(sessionStorage.getItem(`hub-test-${variant}`))
  check(location.hash === '#requirements', 'Old dimensions URL redirects to the unified page')
  check(!document.querySelector('a[href="#dimensions"]'), 'There is only one requirements navigation entry')
  check(!document.querySelector('[data-scale-score],[data-scale-priority],[data-scale-note]'), 'Duplicate scoring and importance forms are gone')
  check(document.querySelector('#context-household').value === '两人常住，每天做饭。', 'Legacy household text is retained in project background')
  check(document.querySelector('[data-context-confirm="household"]').checked, 'An evidenced legacy confirmation is retained')
  check(!document.querySelector('[data-context-confirm="schedule"]').checked, 'Unconfirmed legacy information is not auto-confirmed')
  check(document.querySelector('.hub-archive').textContent.includes('旧的改造范围原文'), 'Other legacy dimension notes remain in the read-only archive')
  check(!document.querySelector('.hub-archive input,.hub-archive select,.hub-archive textarea'), 'Historical records cannot become a second editable source')
  const expectedPending = new Set(project().requirements.flatMap(r => r.pending.map(p => `${r.id}|${p}`))).size
  check(document.querySelectorAll('.hub-pending-row').length === expectedPending, 'Pending list derives directly from current requirements')
  await click('[data-action="hub-locate"]')
  check(document.activeElement?.hasAttribute('data-requirement-id'), 'A pending item locates its original requirement')
  document.querySelector('.hub-context').open = true
  await fill('#context-household', '四人常住，每天做饭。')
  check(!document.querySelector('[data-context-confirm="household"]').checked, 'Editing background revokes its old confirmation')
  await click('[data-context-confirm="household"]')
  document.querySelector('#project-context-form').requestSubmit(); await delay()
  check(project().projectContext.household.text === '四人常住，每天做饭。' && project().projectContext.household.confirmed, 'Background saves as the canonical project value')
  check(localStorage.getItem(scaleKey) === prior.legacy, 'Original legacy archive is byte-preserved')
  check(JSON.stringify(project().snapshots[0]) === prior.snapshot, 'Background edits cannot overwrite a published version')
  await go('clarify')
  check(document.querySelector('.intake-project-context').textContent.includes('四人常住'), 'AI co-creation reuses the canonical background')
  check(!document.querySelector('.intake-project-context textarea'), 'Background is read-only in the interview instead of being filled twice')
  await fill('#intake-brief', '厨房想好打理，客厅与走道地面希望连贯，水电先检查。')
  await click('[data-intake-action="start"]'); await until(() => !!intake().result, 'AI result arrived')
  await click('[data-intake-action="show-draft"]')
  const included = intake().result.items.filter(i => i.origin === 'user' && !['undecided', 'excluded'].includes(i.necessity))
  for (const item of included) await click(`[data-intake-review="${item.id}"]`)
  await click('[data-intake-field="replace"]'); await click('[data-intake-action="adopt"]')
  check(project().intakeDocument.projectContext.some(x => x.text.includes('四人常住')), 'Adopted document preserves the background snapshot used by AI')
  await click('[data-action="publish"]'); await click('[data-action="confirm-publish"]')
  check(project().snapshots.at(-1).projectContext.household.text.includes('四人'), 'Published version records the confirmed project background')
  const snapshots = JSON.stringify(project().snapshots)
  document.querySelector('.hub-context').open = true
  await fill('#context-household', '六人常住，需要重新考虑空间安排。')
  document.querySelector('#project-context-form').requestSubmit(); await delay()
  check(!document.querySelector('[data-action="publish"]') && document.body.textContent.includes('项目背景已改变'), 'Changed background cannot be published beside an older AI draft')
  await go('clarify')
  check(intake().needsAnalysis && intake().reviewedIds.length === 0, 'Changed background revokes old intake confirmations')
  check(JSON.stringify(project().snapshots) === snapshots, 'Published history remains unchanged after background changes')
  await go('vendor')
  check(document.querySelectorAll('.hub-merchant-guide li').length === 9, 'Merchant checks appear in the merchant workspace')
  check(document.querySelector('.hub-merchant-guide').textContent.includes('未指定商家'), 'Old merchant notes are not attributed to a specific company')
  await go('requirements')
  return { variant, checks }
})()
