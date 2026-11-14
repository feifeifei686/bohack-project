// Run only in an isolated QA browser against the Postman-backed intake service.
return (async () => {
  const variant = location.pathname.split('/').filter(Boolean)[1]
  if (!['atmosphere', 'lucid', 'atelier'].includes(variant)) throw Error('Open a lab variant')
  const key = `mingma-${variant}-v1`, intakeKey = `mingma-${variant}-intake-v2`
  const checks = [], delay = () => new Promise(r => setTimeout(r, 100))
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  const until = async (fn, label) => { for (let i = 0; i < 150; i++) { if (fn()) return; await delay() } throw Error(label) }
  const click = async selector => { const el = document.querySelector(selector); if (!el) throw Error(`Missing ${selector}`); el.click(); await delay() }
  const fill = async (selector, value, event = 'input') => { const el = document.querySelector(selector); if (!el) throw Error(`Missing ${selector}`); el.value = value; el.dispatchEvent(new Event(event, { bubbles: true })); await delay() }
  const go = async page => { location.hash = page; await delay() }
  const saved = () => JSON.parse(localStorage.getItem(key) || '{}')
  const intake = () => JSON.parse(localStorage.getItem(intakeKey) || '{}')
  await go('overview'); await click('[data-action="reset"]'); await click('[data-action="confirm-reset"]')
  await click('[data-action="demo"]')
  const oldSnapshot = JSON.stringify(saved().snapshots[0])
  await go('clarify')
  await fill('#intake-brief', '厨房想好打理，加一台洗碗机；客厅和走道地面想连贯，水电我不太懂。')
  await click('[data-intake-action="start"]')
  await until(() => !!document.querySelector('[data-intake-form="answer"]'), 'Initial AI question appeared')
  check(intake().result.items.length === 4, 'AI result supplies four distinct requirement candidates')
  check(new Set(intake().result.items.map(x => x.scope)).size === 4, 'Global, area, shared and unassigned scopes survive')
  check(intake().result.items.flatMap(x => x.standards).filter(x => ['measurement', 'professional'].includes(x.kind)).every(x => x.value === null), 'Unknown engineering values remain null')
  await click('[data-intake-choice="油污擦拭"]'); await click('[data-intake-choice="接缝积灰"]'); await click('[data-intake-action="answer"]')
  await until(() => !!document.querySelector('[data-intake-choice="交界自然"]'), 'Second targeted question appeared')
  check(intake().answers.length === 1 && intake().answers[0].answer.includes('接缝'), 'Multi-choice answer is preserved')
  await click('[data-intake-choice="颜色接近"]'); await click('[data-intake-choice="交界自然"]'); await click('[data-intake-action="answer"]')
  await until(() => !!document.querySelector('[data-intake-item="N001"]'), 'Draft appeared after updated AI result')
  check(intake().answers.length === 2 && !intake().needsAnalysis, 'Answers update the draft through the real HTTP service')
  const ids = intake().result.items.map(x => x.id)
  await click('[data-intake-filter="pending"]')
  check(JSON.stringify(intake().result.items.map(x => x.id)) === JSON.stringify(ids), 'Pending view does not duplicate requirements')
  await click('[data-intake-filter="all"]')
  check(document.querySelector('[data-intake-action="adopt"]').disabled, 'Unconfirmed draft cannot be adopted')
  const included = intake().result.items.filter(x => x.origin === 'user' && !['undecided', 'excluded'].includes(x.necessity))
  for (const item of included) await click(`[data-intake-review="${item.id}"]`)
  check(document.querySelector('[data-intake-action="adopt"]').disabled, 'Existing draft requires explicit replacement acknowledgement')
  await click('[data-intake-field="replace"]')
  await click('[data-intake-action="adopt"]')
  check(location.hash === '#requirements', 'Adoption reaches the existing requirement workflow')
  check(saved().requirements.length === included.length, 'Unaccepted suggestions and undecided items are excluded from merchant obligations')
  check(saved().intakeDocument.result.items.length === 4, 'Full document retains undecided and unaccepted entries')
  check(JSON.stringify(saved().snapshots[0]) === oldSnapshot, 'Adoption leaves published R1 immutable')
  check(document.querySelectorAll('[data-intake-adopted]').length === included.length, 'Structured standards render in the requirement list')
  await click('[data-action="publish"]'); await click('[data-action="confirm-publish"]')
  check(saved().snapshots.at(-1).version === 2 && saved().snapshots.at(-1).intakeDocument.version === 2, 'R2 stores the intake document with its requirement snapshot')
  const published = JSON.stringify(saved().snapshots)
  await click('[data-action="add-requirement"]')
  check(location.hash === '#clarify' && !!document.querySelector('#intake-brief'), 'Adding to a multi-area project opens the new expression workflow')
  const originalBrief = saved().intakeDocument.brief
  await fill('#intake-brief', '这是另一份尚未采用的卧室访谈草稿。')
  await go('requirements'); await click('[data-action="edit-requirement"]')
  check(document.querySelector('dialog').textContent.includes(originalBrief), 'Adopted document opens its own source instead of a newer unadopted conversation')
  check(!document.querySelector('dialog').textContent.includes('另一份尚未采用的卧室'), 'Newer unadopted draft does not masquerade as the adopted source')
  await click('[data-action="restore-adopted-intake"]')
  check(intake().brief === originalBrief && intake().reviewedIds.length === 0, 'Explicit restore copies the adopted document into a fresh unconfirmed draft')
  check(JSON.stringify(saved().snapshots) === published, 'Restoring a conversation cannot rewrite published history')
  return { variant, checks }
})()
