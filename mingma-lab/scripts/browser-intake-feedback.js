// Run on a fresh demo tab with a delayed response fixture.
return (async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const check = (ok, message) => { if (!ok) throw Error(message) }
  const q = selector => document.querySelector(selector)
  const click = action => q(`[data-intake-action="${action}"]`).click()
  const status = () => q('.intake-request-dock')?.dataset.intakeRequestStatus
  const originalFetch = window.fetch
  const scrollIntoView = HTMLElement.prototype.scrollIntoView
  const destinations = []
  HTMLElement.prototype.scrollIntoView = function (options) {
    if (this.matches('.intake-question h3, #intake-draft-title')) destinations.push({ target: this, behavior: options.behavior })
    return scrollIntoView.call(this, options)
  }
  let respond
  let signal
  location.hash = '#clarify'
  await wait(130)
  try {
    window.fetch = (_url, options) => {
      signal = options.signal
      return new Promise((resolve, reject) => {
        respond = resolve
        signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
      })
    }
    const brief = q('#intake-brief')
    brief.value = '想保留卫生间的浴室柜'
    brief.dispatchEvent(new Event('input', { bubbles: true }))
    q('[data-intake-action="start"]').scrollIntoView({ block: 'center' })
    const y = scrollY
    click('start')
    await wait(270)
    const dock = q('.intake-request-dock').getBoundingClientRect()
    check(status() === 'busy' && dock.bottom <= innerHeight && dock.top >= 0 && dock.right <= innerWidth, 'Waiting indicator stays in the viewport')
    check(Math.abs(scrollY - y) < 3, 'Submitting does not scroll away from the user')
    check(q('.intake-space-caption').textContent.includes('AI 正在整理'), 'The model mirrors the waiting status')
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
    click('locate-model')
    await wait(650)
    const model = q('.intake-space-header').getBoundingClientRect()
    check(model.top >= 0 && model.bottom <= innerHeight, 'View model returns to the preview')
    click('cancel')
    check(signal.aborted && status() === 'cancelled', 'Cancelling clears the waiting state immediately')
    click('start')
    respond(new Response(JSON.stringify({ error: { message: '测试：请求暂未完成' } }), { status: 503 }))
    await wait(150)
    check(status() === 'error' && !!q('[data-intake-action="retry"]'), 'Failure and retry are visible in the same place')
    check(destinations.length === 0, 'Cancellation and failure do not navigate to a result')
    click('retry')
    respond(new Response(JSON.stringify({
      meta: { requiresHumanConfirmation: true },
      data: { summary: '希望保留浴室柜', items: [], questions: [{ id: 'q-feedback', targetId: null, dimension: 'scope', text: '浴室柜哪些部分要保留？', reason: '确认范围', options: ['全部'], allowMultiple: false, priority: 'scope' }], conflicts: [], readyForDraft: false, stopReason: '', warnings: [] },
    })))
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    async function checkDestination(selector) {
      await wait(700)
      const heading = q(selector)
      const rect = heading.getBoundingClientRect()
      check(!status() && document.activeElement === heading, 'Successful response clears the dock and focuses the new result')
      check(destinations.at(-1)?.target === heading && destinations.at(-1)?.behavior === behavior, 'Successful response scrolls without another click')
      check(rect.top >= 0 && rect.bottom <= innerHeight, 'Result heading lands inside the viewport')
    }
    await checkDestination('.intake-question h3')
    click('skip')
    respond(new Response(JSON.stringify({
      meta: { requiresHumanConfirmation: true },
      data: { summary: '范围整理完成', items: [], questions: [], conflicts: [], readyForDraft: true, stopReason: '已完成', warnings: [] },
    })))
    await checkDestination('#intake-draft-title')
    check(destinations.length === 2, 'Question and draft each receive a single automatic scroll')
    return 'Waiting, cancel, retry, and automatic question and draft scrolling passed'
  } finally {
    window.fetch = originalFetch
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    location.hash = '#overview'
  }
})()
