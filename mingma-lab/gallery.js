const editions = {
  atmosphere: '雾屿 Atmosphere',
  lucid: '澄境 Lucid',
  atelier: '筑序 Atelier',
}
const storageKey = 'mingma-lab-acceptance-v1'
let saved = {}
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
} catch {}
const selection = document.querySelector('#edition-select')
if (editions[saved.version]) selection.value = saved.version
function refresh() {
  document.querySelectorAll('[data-route]').forEach((link) => {
    link.href = `./versions/${selection.value}/index.html#${link.dataset.route}`
  })
  const answers = saved[selection.value] || {}
  document.querySelectorAll('[data-check]').forEach((box) => {
    box.checked = !!answers[box.dataset.check]
  })
  const count = Object.values(answers).filter(Boolean).length
  document.querySelector('#check-summary').textContent = `已检查 ${count} / 8 项`
}
function persist() {
  saved.version = selection.value
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved))
  } catch {}
}
selection.addEventListener('change', () => {
  persist()
  refresh()
})
document.querySelectorAll('[data-check]').forEach((box) =>
  box.addEventListener('change', () => {
    saved[selection.value] ||= {}
    saved[selection.value][box.dataset.check] = box.checked
    persist()
    refresh()
  }),
)
document.querySelector('#reset-checks').addEventListener('click', () => {
  saved[selection.value] = {}
  persist()
  refresh()
})
const dialog = document.querySelector('#mobile-preview')
document.querySelectorAll('[data-mobile]').forEach((button) =>
  button.addEventListener('click', () => {
    const id = button.dataset.mobile
    document.querySelector('#mobile-preview-title').textContent = `${editions[id]} · 手机首屏`
    document.querySelector('#mobile-preview-image').src = `./previews/${id}-mobile.webp`
    dialog.showModal()
  }),
)
document.querySelector('#close-preview').addEventListener('click', () => dialog.close())
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})
refresh()
