return (async () => {
  const results = []
  const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms))
  const check = (condition, label) => {
    if (!condition) throw new Error(label)
    results.push(label)
  }
  const click = selector => document.querySelector(selector).click()
  const selected = () => [...document.querySelectorAll('.planning-room.is-selected')].map(room => room.dataset.floorRoom)
  const selectedButton = () => document.querySelector('[data-planning-room][aria-pressed="true"]')?.dataset.planningRoom
  const lift = id => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(`[data-floor-room="${id}"]`)).transform).m42
  const floorRoom = id => document.querySelector(`[data-floor-room="${id}"]`)
  const dispatchClick = node => node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  location.hash = 'overview'
  await wait()
  check(!document.querySelector('#house-canvas, .planning-floorplan'), 'Overview has no model')
  const start = [...document.querySelectorAll('button[data-action="go-planning"]')].find(button => button.textContent.includes('开始硬装规划'))
  check(!!start, 'Overview has a Start Hard Renovation Planning button')
  start.click()
  await wait()
  check(!document.querySelector('[data-drawing-slot]').hidden, 'Original demo drawing comes first')
  click('[data-plan-step="build"]')
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await wait(610)
    const sheet = document.querySelector('.planning-build-paper')
    const wallFace = floorRoom('bedroom').querySelector('[data-model-wall] polygon')
    const wallFoot = wallFace.points.getItem(3)
    const projected = new DOMPoint(0, 0).matrixTransform(sheet.transform.baseVal.getItem(0).matrix)
    check(Math.hypot(wallFoot.x - projected.x, wallFoot.y - projected.y) < .03, 'The drawing and wall foot stay aligned during extrusion')
    await wait(1560)
    const sidebar = document.querySelector('.planning-sidebar')
    const sidebarY = sidebar.getBoundingClientRect().top + scrollY
    const opacity = Number(getComputedStyle(sidebar).opacity)
    check(opacity > 0 && opacity < 1 && lift('bathroom') < 0, 'The room lifts and the populated sidebar fades in before the build ends')
    check(document.querySelector('.planning-layout').inert && !!document.querySelector('#planning-room-title'), 'Controls keep their final layout while the build is still active')
    await wait(850)
    check(!document.querySelector('.planning-layout').inert && Math.abs(sidebar.getBoundingClientRect().top + scrollY - sidebarY) < 1, 'The sidebar is interactive at the same position after settling')
  }
  check(location.hash === '#planning' && selected().join() === 'bathroom' && lift('bathroom') < 0 && selectedButton() === 'bathroom', 'Second screen defaults to a lifted bathroom and a matching room button')
  const wall = floorRoom('bathroom').querySelector('[data-model-wall]')
  const floor = floorRoom('bathroom').querySelector('[data-model-floor]')
  const wallOffset = wall.getBoundingClientRect().top - floor.getBoundingClientRect().top
  check(document.querySelector('#planning-room-title').textContent === '卫生间', 'Bathroom drawer title matches the model')
  check([...document.querySelectorAll('.planning-needs b')].map(item => item.textContent).join('|') === '保留现有浴室柜|仅拆除旧地砖|拆除垃圾需外运', 'Bathroom shows the three demo requirements')
  for (const [id, label] of [['bath-vanity', '保留现有浴室柜'], ['bath-tile', '仅拆除旧地砖']]) {
    const hotspot = document.querySelector(`[data-floor-hotspot="${id}"]`)
    const center = hotspot.querySelector('circle').getBoundingClientRect()
    const target = document.elementFromPoint(center.x + center.width / 2, center.y + center.height / 2)
    check(target?.closest('[data-floor-hotspot]') === hotspot, `${id} hit target follows the lifted room`)
    dispatchClick(target)
    check(document.querySelector('.planning-needs .is-highlighted b')?.textContent === label, `${id} highlights the corresponding need`)
  }
  dispatchClick(floorRoom('living').querySelector('polygon'))
  check([...document.querySelectorAll('.planning-outline')].filter(outline => getComputedStyle(outline).stroke !== 'rgba(0, 0, 0, 0)').length === 1, 'Switching rooms clears the previous outline immediately')
  await wait(600)
  check(selected().join() === 'living' && lift('bathroom') === 0 && lift('living') < 0 && selectedButton() === 'living', 'Model clicks switch the single lifted room and its button')
  check(Math.abs(wall.getBoundingClientRect().top - floor.getBoundingClientRect().top - wallOffset) < .1 && !document.querySelector('.planning-needs .is-highlighted'), 'Wall and floor move together and previous spotlight clears')
  check(document.querySelector('#planning-room-title').textContent === '客厅' && document.querySelector('.planning-needs').textContent.includes('确认插座点位调整'), 'Living-room drawer replaces bathroom details')
  click('[data-planning-room="kitchen"]')
  await wait(600)
  check(selected().join() === 'kitchen' && lift('kitchen') < 0, 'Room buttons use the same selection and lift state')
  click('[data-action="plan-current-room"]')
  await wait()
  check(location.hash === '#clarify' && document.querySelector('.intake-planning-context').textContent.includes('厨房'), 'Planning button enters AI intake with a visible kitchen context')
  check(document.querySelector('[data-intake-area="厨房"]').checked, 'Kitchen is preselected in the existing AI intake form')
  click('.intake-planning-context a')
  await wait(600)
  check(selected().join() === 'kitchen' && selectedButton() === 'kitchen', 'Returning to spatial selection preserves the room')
  click('[data-action="plan-whole-home"]')
  await wait()
  check(location.hash === '#clarify' && document.querySelector('.intake-planning-context').textContent.includes('全屋硬装规划'), 'Whole-home planning is reachable from the same screen')
  return results
})()
