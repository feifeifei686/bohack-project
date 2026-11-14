return (async () => {
  const version = location.pathname.split('/').filter(Boolean)[1]
  if (!['atmosphere', 'lucid', 'atelier'].includes(version)) throw Error('Open a lab version first')
  const key = `mingma-${version}-v1`
  const scaleKey = `mingma-${version}-dimensions-v1`
  const results = []
  const wait = () => new Promise((resolve) => setTimeout(resolve, 90))
  const check = (condition, label) => { if (!condition) throw Error(label); results.push(label) }
  const click = async (selector) => {
    const node = document.querySelector(selector)
    if (!node) throw Error(`Missing ${selector}`)
    node.click(); await wait()
  }
  const go = async (route) => { location.hash = route; await wait() }
  const change = async (selector, value, event = 'change') => {
    const node = document.querySelector(selector)
    if (!node) throw Error(`Missing ${selector}`)
    node.value = value; node.dispatchEvent(new Event(event, { bubbles: true })); await wait()
  }
  const state = () => JSON.parse(localStorage.getItem(key))
  const reset = async () => { await go('overview'); await click('[data-action="reset"]'); await click('[data-action="confirm-reset"]') }
  const generate = async () => {
    await go('clarify'); await click('[data-action="sample-brief"]'); await click('[data-action="start-questions"]')
    for (const choices of [['保留现有布局'], ['洗碗机', '电饭煲', '咖啡机'], ['容易擦拭、减少接缝'], ['不要开放展示格'], ['保留现有窗']]) {
      for (const value of choices) await click(`input[value="${value}"]`)
      await click('[data-action="next-question"]')
    }
    await click('[data-action="publish"]'); await click('[data-action="confirm-publish"]')
  }
  // One real proposal plus an absent merchant must be usable.
  await reset(); await generate(); await go('compare'); await click('[data-action="go-vendor"]')
  await click('[data-action="demo-revise"]'); await click('[data-action="submit-vendor"]')
  check(state().proposals.length === 1, 'Single merchant submission remains a single proposal')
  check(!document.querySelector('[data-proposal^="pending-"]'), 'Absent merchant has no broken evidence link')
  const buttons = [...document.querySelectorAll('[data-action="select-proposal"]')]
  check(buttons.length === 2 && !buttons[0].disabled && buttons[1].disabled, 'Only submitted merchant can be selected')

  // Fully responded R1 proposals must not hide stale rows after R2.
  await go('vendor'); await click('[data-vendor="b"]'); await click('[data-action="demo-revise"]'); await click('[data-action="submit-vendor"]')
  check(state().proposals.length === 2, 'Second merchant submits without replacing first')
  await click('[data-action="select-proposal"]'); await click('[data-action="confirm-selection"]')
  await go('requirements'); await change('[data-priority="K04"]', 'must'); await click('[data-action="publish"]'); await click('[data-action="confirm-publish"]')
  await go('compare'); await click('[data-filter="issues"]')
  check(document.querySelectorAll('.comparison tbody tr').length === state().snapshots.at(-1).requirements.length, 'All stale requirements remain in pending filter')
  check(!document.querySelector('.comparison tbody').textContent.includes('所有条目均已有商家回应'), 'Pending filter cannot claim stale proposals are complete')
  await go('overview')
  const completion = document.querySelector('.step[data-action="go-records"] .step-number')
  if (completion) check(!completion.querySelector('svg'), 'Old selection is not shown as current completed step')
  check(state().selection.requirements.version === 1, 'Historical selection snapshot remains immutable')

  // A fresh proposal can be selected while the other merchant is stale.
  await go('vendor'); await click('[data-vendor="a"]'); await click('[data-action="demo-revise"]'); await click('[data-action="submit-vendor"]')
  const current = [...document.querySelectorAll('[data-action="select-proposal"]')]
  check(!current[0].disabled && current[1].disabled, 'A current proposal is not blocked by another stale merchant')
  await click('[data-action="select-proposal"]'); await click('[data-action="confirm-selection"]')
  check(state().selection.requirements.version === 2, 'New selection binds current requirement version')

  // A new demonstration clears the current project background without reviving old evidence.
  await reset(); await go('requirements')
  document.querySelector('.hub-context').open = true
  await change('#context-household', '旧项目的确认依据，不应带入新演示', 'input')
  await click('[data-context-confirm="household"]')
  document.querySelector('#project-context-form').requestSubmit(); await wait()
  check(state().projectContext.household.confirmed, 'Background confirmation saved for current project')
  await go('overview'); await click('[data-action="demo"]'); await go('requirements')
  check(document.querySelector('#context-household').value === '', 'New demonstration clears old background evidence')

  // Custom edited needs remain human-review items, and drafts survive navigation.
  await go('requirements'); await click('[data-action="edit-requirement"][data-id="K04"]')
  await change('#req-description', '墙面希望呈现经过用户确认的特殊纹理；需商家提供样板后人工核对。', 'input')
  document.querySelector('#requirement-form').requestSubmit(); await wait()
  await click('[data-action="publish"]'); await click('[data-action="confirm-publish"]')
  await go('vendor'); await click('[data-vendor="a"]'); await click('[data-action="demo-revise"]'); await click('[data-action="submit-vendor"]')
  const customRow = [...document.querySelectorAll('.comparison tbody tr')].find((row) => row.textContent.includes('K04'))
  check(customRow && !customRow.querySelectorAll('td')[1].querySelector('.responded'), 'Edited requirement cannot reuse standard rule as automatic success')
  await go('vendor'); await click('[data-vendor="a"]')
  await change('[data-proposal-text="K01"]', '草稿隔离测试：保留水槽与冰箱。', 'input')
  await click('[data-vendor="b"]'); await click('[data-vendor="a"]')
  check(document.querySelector('[data-proposal-text="K01"]').value.includes('草稿隔离测试'), 'Merchant draft survives switching')
  await go('dimensions'); await go('vendor')
  check(document.querySelector('[data-proposal-text="K01"]').value.includes('草稿隔离测试'), 'Merchant draft survives page navigation')
  return { version, checks: results }
})()
