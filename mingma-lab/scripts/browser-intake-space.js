// Run in a fresh demo tab. AI responses are supplied by browser fixtures.
return (async () => {
  const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms))
  const originalFetch = window.fetch
  const checks = []
  const check = (ok, text) => { if (!ok) throw Error(text); checks.push(text) }
  const go = async route => { location.hash = route; await wait() }
  const click = selector => document.querySelector(selector).click()
  const model = () => document.querySelector('.intake-space')
  const focus = () => [...model().querySelectorAll('.planning-room.is-focused')].map(room => room.dataset.floorRoom)
  const item = (id, component, areas, scope = 'area') => ({
    id, title: component, component, areas, scope, category: '硬装', description: '测试范围',
    origin: 'user', necessity: 'must', clarity: 'clear', evidence: [], standards: [], pending: [], dependencies: [],
  })
  const question = (id, targetId, text, priority = 'detail') => ({
    id, targetId, text, dimension: 'scope', reason: '测试空间定位', options: ['保留', '更换'], allowMultiple: false, priority,
  })
  try {
    await go('planning')
    check(!!document.querySelector('.planning-stage .planning-floorplan'), 'Full floorplan is shown before intake')
    if (!document.querySelector('[data-drawing-slot]').hidden) {
      click('[data-plan-step="build"]')
      await wait(2900)
    }
    click('[data-planning-room="bathroom"]')
    await wait(560)
    const original = document.querySelector('.planning-stage .planning-floorplan')
    const room = original.querySelector('[data-floor-room="bathroom"]')
    const lift = getComputedStyle(room).transform
    if (innerWidth < 960) window.scrollTo({ top: 260, behavior: 'instant' })
    const source = new DOMPoint(0, 16).matrixTransform(original.getScreenCTM())
    click('[data-action="plan-current-room"]')
    await wait(80)
    check(focus().join() === 'bathroom' && !!model().querySelector('a[href="#planning"]'), 'Miniature appears in intake with the selected room')
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const orbit = model().querySelector('.intake-space-orbit')
      const arrival = orbit.getAnimations().find(anim => anim.effect.getTiming().duration === 1320)
      check(!!arrival && orbit.querySelector('svg') === original, 'The original SVG moves into the preview without being replaced')
      arrival.pause()
      arrival.currentTime = 0
      const start = new DOMPoint(0, 16).matrixTransform(original.getScreenCTM())
      check(Math.hypot(source.x - start.x, source.y - start.y) < 1.5, 'The flight starts exactly where the model was visible')
      check(getComputedStyle(room).transform === lift && lift !== 'none', 'The flight keeps the raised room pose')
      check(getComputedStyle(original).opacity === '1', 'The original model remains visible throughout the flight')
      arrival.play()
      await arrival.finished
      check(model().querySelector('.planning-floorplan') === original && model().classList.contains('is-glass'), 'The same SVG changes to glass and stays in the preview')
    }
    const priorModel = model()
    const brief = document.querySelector('#intake-brief')
    brief.value = '保留卫生间浴室柜'
    brief.dispatchEvent(new Event('input', { bubbles: true }))
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      check(model().querySelector('.intake-space-motion').getAnimations().some(anim => anim.effect.getTiming().duration === 680), 'First expression triggers a single light cue')
      await wait(480)
      check(model().classList.contains('is-visible') && getComputedStyle(model().querySelector('.planning-floorplan')).animationPlayState === 'running', 'The on-screen miniature starts its rotation renderer')
    }
    let analysisStarted = false
    window.fetch = (_url, options) => new Promise((_resolve, reject) => {
      analysisStarted = model().dataset.spatialPhase === 'analyzing'
      options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))
    })
    try {
      click('[data-intake-action="start"]')
      check(analysisStarted && model() === priorModel, 'Submitting shows the analysis animation without remounting the miniature')
      click('[data-intake-action="cancel"]')
      check(model().dataset.spatialPhase === 'express', 'Cancelling restores the expression state')
    } finally {
      window.fetch = originalFetch
    }
    const items = [
      item('N001', '浴室柜', ['卫生间']), item('N002', '地面', ['客厅']),
      item('N003', '交界', ['客厅', '玄关'], 'shared'), item('N004', '布局', [], 'global'),
    ]
    const questions = [
      question('q-bath', 'N001', '浴室柜想保留哪些部分？'),
      question('q-floor', 'N002', '客厅地面铺装需要覆盖哪些位置？'),
      question('q-shared', 'N003', '如何处理客厅与玄关的交界？'),
      question('q-global', 'N004', '全屋水电先检查哪些项目？'),
    ]
    const respondWith = questions => {
      window.fetch = async () => new Response(JSON.stringify({
        meta: { requiresHumanConfirmation: true },
        data: { summary: '空间定位测试', items, questions, conflicts: [], warnings: [], readyForDraft: false, stopReason: '' },
      }))
    }
    respondWith(questions.slice(0, 2))
    click('[data-intake-action="start"]')
    await wait()
    check(focus().join() === 'bathroom' && model().querySelector('[data-floor-feature="bath-vanity"].is-feature-focus'), 'First question highlights the bathroom vanity')
    const questionModel = model()
    click('[data-intake-choice="保留"]')
    click('[data-intake-action="answer"]')
    await wait()
    check(model() === questionModel && focus().join() === 'living' && model().querySelector('[data-model-floor].is-feature-focus') && !model().querySelector('[data-floor-feature].is-feature-focus'), 'Answering switches to the next room and floor without remounting')
    for (const [q, expected] of [[questions[2], ['living', 'entry']], [questions[3], []]]) {
      respondWith([q])
      click('[data-intake-action="skip"]')
      await wait()
      check(focus().join() === expected.join() && !model().querySelector('.is-feature-focus'), `${q.id} highlights its scope and clears the previous part`)
    }
    return checks
  } finally {
    await go('overview')
    window.fetch = originalFetch
  }
})()
