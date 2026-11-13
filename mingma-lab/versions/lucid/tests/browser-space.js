return (async () => {
  const results = []
  const wait = () => new Promise((resolve) => setTimeout(resolve, 100))
  const check = (condition, label) => {
    if (!condition) throw new Error(label)
    results.push(label)
  }
  location.hash = 'overview'
  await wait()
  const svg = document.querySelector('.holographic-model')
  check(!!svg && svg.querySelectorAll('polygon').length > 30, '3D faces render without WebGL')
  const before = svg.querySelector('polygon').getAttribute('points')
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await wait()
  check(svg.querySelector('polygon').getAttribute('points') !== before, 'Keyboard rotation changes projected geometry')
  document.querySelector('.room-orbit [data-room="bedroom"]').click()
  await wait()
  check(document.querySelector('#overview-room-name').textContent === '卧室', 'Homepage room selection updates spatial anchor')
  const iso = svg.querySelector('polygon').getAttribute('points')
  document.querySelector('[data-action="view-top"]').click()
  await wait()
  check(svg.querySelector('polygon').getAttribute('points') !== iso, 'Top view changes model projection')
  location.hash = 'space'
  await wait()
  const model = document.querySelector('.holographic-model')
  check(model.querySelectorAll('[data-route]').length > 0, 'Route layers render in the space view')
  const source = document.querySelector('#space-vendor')
  source.value = 'a'
  source.dispatchEvent(new Event('change', { bubbles: true }))
  await wait()
  check(model.querySelectorAll('[data-route]').length === 0, 'Merchant without geometry cannot inherit demo routes')
  source.value = 'overview'
  source.dispatchEvent(new Event('change', { bubbles: true }))
  await wait()
  check(model.querySelectorAll('[data-route]').length > 0, 'Demo routes restore when selected explicitly')
  for (const box of document.querySelectorAll('[data-layer]')) {
    box.checked = false
    box.dispatchEvent(new Event('change', { bubbles: true }))
  }
  await wait()
  check(model.querySelectorAll('[data-route]').length === 0, 'Layer toggles hide all routes')
  const walls = document.querySelector('[data-action="walls"]')
  walls.click()
  await wait()
  check(walls.textContent === '显示墙体', 'Wall visibility toggle remains operable')
  check(document.documentElement.scrollWidth <= innerWidth, 'Space view has no page overflow')
  return results
})()
