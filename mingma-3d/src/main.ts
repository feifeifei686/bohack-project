import './style.css'
import { rooms, routes } from './house-data'
import { createHouseView } from './house-view'

type Layer = 'cold' | 'hot' | 'electric'
type WallMode = 'cutaway' | 'full' | 'hidden'
type ViewMode = 'iso' | 'top'
const layerNames: Record<Layer, string> = { cold: '冷水管', hot: '热水管', electric: '电线走向' }
const enabledLayers = new Set<Layer>(['cold', 'hot', 'electric'])
let selectedRoom: string | null = null
let selectedRoute: string | null = null
let wallMode: WallMode = 'cutaway'
let viewMode: ViewMode = 'iso'
let house: ReturnType<typeof createHouseView> | undefined

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!)

function routeLength(route: typeof routes[number]) {
  return route.points.slice(1).reduce((length, point, index) => {
    const previous = route.points[index]
    return length + Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2])
  }, 0)
}

function visibleRoutes() {
  return routes.filter((route) => enabledLayers.has(route.layer) && (!selectedRoom || route.roomId === selectedRoom))
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="明码首页"><span class="brand-mark" aria-hidden="true">明</span><span>明码</span></a>
    <span class="brand-divider" aria-hidden="true"></span><span class="workspace-name">硬装方案工作台</span>
    <span class="prototype-tag">交互样例</span>
  </header>
  <main>
    <div class="page-heading">
      <div><h1>看得见的水电走线</h1><p>选择空间和线路，把施工范围看清楚。</p></div>
      <button class="export-button" id="export">导出示意清单 <span aria-hidden="true">↓</span></button>
    </div>
    <div class="workspace">
      <section class="model-panel" aria-label="三维户型与线路">
        <div class="model-toolbar">
          <div class="view-switch" role="group" aria-label="选择视角">
            <button data-view="iso" aria-pressed="true">轴测视角</button>
            <button data-view="top" aria-pressed="false">俯视平面</button>
          </div>
          <label class="wall-control">墙体 <select id="wall-mode" aria-label="墙体显示方式"><option value="cutaway">剖切</option><option value="full">完整</option><option value="hidden">隐藏</option></select></label>
          <button class="text-button reset-view" id="reset">重置视角</button>
        </div>
        <div class="canvas-wrap">
          <div id="scene" role="img" aria-label="可旋转缩放的五个房间示例户型，下面的房间按钮和右侧线路列表可完成同样的选择操作"></div>
          <div class="scene-label"><span class="status-dot"></span>五空间示例户型<span class="scene-area">67 m²</span></div>
          <div class="scene-instruction">拖动旋转 · 滚轮缩放 · 点击空间或线路</div>
          <div class="scene-error" id="scene-error" hidden></div>
        </div>
        <div class="room-bar" role="group" aria-label="选择房间">
          <button class="room-button" data-room="" aria-pressed="true">全屋 <span>67㎡</span></button>
          ${rooms.map((room) => `<button class="room-button" data-room="${room.id}" aria-pressed="false">${room.name} <span>${room.area}㎡</span></button>`).join('')}
        </div>
        <div class="model-footnote">模型与走线用于沟通演示，实际布局、工程量及施工参数需按施工图和现场复核。</div>
      </section>
      <aside class="detail-panel" aria-label="图层与线路详情">
        <section class="layer-section">
          <h2>显示图层</h2>
          <div class="layer-toggles">${(['cold', 'hot', 'electric'] as Layer[]).map((layer) => `
            <label class="layer-option"><span class="layer-dot ${layer}"></span><span>${layerNames[layer]}</span><input type="checkbox" data-layer="${layer}" checked aria-label="显示${layerNames[layer]}"><span class="switch" aria-hidden="true"></span></label>
          `).join('')}</div>
        </section>
        <section class="route-section"><div class="section-heading"><h2 id="route-heading">全屋线路</h2><span id="route-count"></span></div><div id="route-list"></div></section>
        <section id="route-detail" class="route-detail" aria-live="polite"></section>
      </aside>
    </div>
    <p class="bottom-note">先理解走向，再确认施工项目。点击一条线路，查看起终点与关联清单。</p>
    <div class="toast" id="toast" role="status" hidden></div>
  </main>`

function renderPanel() {
  const room = rooms.find((item) => item.id === selectedRoom)
  const list = visibleRoutes()
  document.querySelector('#route-heading')!.textContent = `${room?.name ?? '全屋'}线路`
  document.querySelector('#route-count')!.textContent = `${list.length} 条`
  document.querySelector('#route-list')!.innerHTML = list.length ? list.map((route) => `
    <button class="route-button" data-route="${route.id}" aria-pressed="${route.id === selectedRoute}">
      <span class="route-symbol ${route.layer}" aria-hidden="true"></span>
      <span class="route-button-copy"><strong>${escapeHtml(route.name)}</strong><span>${layerNames[route.layer]} · 模型长度 ${routeLength(route).toFixed(1)} m</span></span>
      <span class="route-arrow" aria-hidden="true">›</span>
    </button>`).join('') : '<p class="empty-state">当前空间没有已显示的线路。可以开启其他图层或切换房间。</p>'

  const route = routes.find((item) => item.id === selectedRoute)
  const detail = document.querySelector('#route-detail')!
  if (route) {
    detail.innerHTML = `
      <div class="detail-heading"><h2>${escapeHtml(route.name)}</h2><button class="text-button" id="clear-route">取消选中</button></div>
      <div class="endpoints"><div><span class="endpoint-label">起点</span><strong>${escapeHtml(route.from)}</strong></div><div><span class="endpoint-label">终点</span><strong>${escapeHtml(route.to)}</strong></div></div>
      <p class="route-note">${escapeHtml(route.note)}</p>
      <h3>关联施工项目</h3><ul class="work-items">${route.workItems.map((item) => `<li>${escapeHtml(item)}<span>待复核</span></li>`).join('')}</ul>
      <p class="quantity-note">长度按演示模型坐标计算，现场计量后才能用于报价。</p>`
  } else {
    detail.innerHTML = '<h2>从走线到施工清单</h2><p class="intro-copy">选择一条线路，查看它连接哪里，以及需要向装修公司确认哪些施工内容。</p><div class="detail-hint">图中颜色区分演示图层。具体线路方案由施工方复核。</div>'
  }
  document.querySelectorAll<HTMLButtonElement>('[data-room]').forEach((button) => {
    button.setAttribute('aria-pressed', String((button.dataset.room || null) === selectedRoom))
  })
}

function selectRoom(id: string | null) {
  selectedRoom = id
  selectedRoute = null
  house?.selectRoute(null)
  house?.selectRoom(id)
  renderPanel()
}

function selectRoute(id: string | null) {
  const route = routes.find((item) => item.id === id)
  selectedRoute = route?.id ?? null
  if (route) selectedRoom = route.roomId
  house?.selectRoom(selectedRoom)
  house?.selectRoute(selectedRoute)
  renderPanel()
}

function setView(view: ViewMode) {
  viewMode = view
  house?.setView(view)
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)))
}

document.querySelector('#app')!.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button')
  if (!button) return
  if (button.hasAttribute('data-room')) selectRoom(button.dataset.room || null)
  if (button.dataset.route) selectRoute(button.dataset.route)
  if (button.dataset.view) setView(button.dataset.view as ViewMode)
  if (button.id === 'reset') setView(viewMode)
  if (button.id === 'clear-route') selectRoute(null)
})

document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((input) => {
  input.addEventListener('change', () => {
    const layer = input.dataset.layer as Layer
    if (input.checked) enabledLayers.add(layer)
    else enabledLayers.delete(layer)
    house?.setLayer(layer, input.checked)
    if (routes.find((route) => route.id === selectedRoute)?.layer === layer && !input.checked) {
      selectedRoute = null
      house?.selectRoute(null)
    }
    renderPanel()
  })
})

document.querySelector<HTMLSelectElement>('#wall-mode')!.addEventListener('change', (event) => {
  wallMode = (event.target as HTMLSelectElement).value as WallMode
  house?.setWallMode(wallMode)
})

let toastTimeout: ReturnType<typeof setTimeout>
document.querySelector('#export')!.addEventListener('click', () => {
  const rows = [['数据性质', '房间', '线路', '图层', '模型长度m', '起点', '终点', '关联工项', '复核状态']]
  for (const route of visibleRoutes()) {
    rows.push(['演示数据', rooms.find((room) => room.id === route.roomId)!.name, route.name, layerNames[route.layer], routeLength(route).toFixed(2), route.from, route.to, route.workItems.join('；'), '待施工图与现场复核'])
  }
  const csv = '\uFEFF' + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `明码-${rooms.find((room) => room.id === selectedRoom)?.name ?? '全屋'}-走线示意.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  const toast = document.querySelector<HTMLDivElement>('#toast')!
  toast.textContent = `已导出当前 ${rows.length - 1} 条示意线路`
  toast.hidden = false
  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.hidden = true }, 3200)
})

renderPanel()
try {
  house = createHouseView(document.querySelector<HTMLDivElement>('#scene')!, { onRoomSelect: selectRoom, onRouteSelect: selectRoute })
} catch (error) {
  const panel = document.querySelector<HTMLDivElement>('#scene-error')!
  panel.hidden = false
  panel.textContent = '三维视图未能启动。请开启浏览器硬件加速后刷新页面，房间和线路清单仍可使用。'
  console.error('3D initialization failed', error)
}
if (import.meta.hot) import.meta.hot.dispose(() => { house?.dispose(); clearTimeout(toastTimeout) })
