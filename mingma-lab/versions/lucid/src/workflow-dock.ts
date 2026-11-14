export type WorkflowDockInput = {
  title: string
  description: string
  nextLabel?: string
  backLabel?: string
  busy?: boolean
  saveText?: string
}

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const arrow = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>'

export function renderWorkflowDock(input: WorkflowDockInput): string {
  return `<nav id="workflow-dock" class="workflow-dock" aria-label="当前任务与下一步" data-busy="${Boolean(input.busy)}">
    <div class="workflow-dock-copy">
      <div class="workflow-dock-title-row"><h2 data-workflow-title>${escape(input.title)}</h2><small data-workflow-save ${input.saveText ? '' : 'hidden'}>${escape(input.saveText || '')}</small></div>
      <p id="workflow-dock-description" class="workflow-dock-description" data-workflow-description>${escape(input.description)}</p>
      <p class="workflow-dock-feedback" data-workflow-feedback role="status" aria-live="polite" aria-atomic="true" hidden></p>
    </div>
    <div class="workflow-dock-actions">
      <button type="button" class="workflow-back" data-action="workflow-back"><span data-workflow-back-label>${escape(input.backLabel || '上一步')}</span></button>
      <button type="button" class="workflow-next" data-action="workflow-next" aria-describedby="workflow-dock-description" ${input.busy ? 'disabled' : ''}><span class="workflow-dock-busy" aria-hidden="true"></span><span data-workflow-next-label>${escape(input.nextLabel || '下一步')}</span>${arrow}</button>
    </div>
  </nav>`
}

/** Keep the focused navigation controls alive when a field changes. */
export function updateWorkflowDock(root: HTMLElement, input: WorkflowDockInput): void {
  const setText = (selector: string, value: string) => {
    const element = root.querySelector<HTMLElement>(selector)
    if (element && element.textContent !== value) element.textContent = value
  }
  setText('[data-workflow-title]', input.title)
  setText('[data-workflow-description]', input.description)
  setText('[data-workflow-next-label]', input.nextLabel || '下一步')
  setText('[data-workflow-back-label]', input.backLabel || '上一步')
  setText('[data-workflow-save]', input.saveText || '')
  const save = root.querySelector<HTMLElement>('[data-workflow-save]')
  if (save) save.hidden = !input.saveText
  const next = root.querySelector<HTMLButtonElement>('[data-action="workflow-next"]')
  if (next) next.disabled = Boolean(input.busy)
  root.dataset.busy = String(Boolean(input.busy))
}

let activeHighlight: (() => void) | undefined
let hintSequence = 0

export function clearWorkflowHighlight(): void {
  activeHighlight?.()
  activeHighlight = undefined
}

/** A failed Next points to the task itself, while leaving its explanation visible. */
export function highlightWorkflowTarget(target: HTMLElement, message: string, root?: HTMLElement): () => void {
  clearWorkflowHighlight()
  if (!target.isConnected) return () => {}
  for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
  }
  if (target instanceof HTMLDetailsElement) target.open = true

  const dock = root?.matches('#workflow-dock') ? root : root?.querySelector<HTMLElement>('#workflow-dock') || document.querySelector<HTMLElement>('#workflow-dock')
  const feedback = dock?.querySelector<HTMLElement>('[data-workflow-feedback]')
  const id = `workflow-field-hint-${++hintSequence}`
  const hint = document.createElement('p')
  hint.id = id
  hint.className = 'workflow-field-hint'
  hint.textContent = message
  let hintAnchor: HTMLElement = target
  if (target.matches('input[type="checkbox"], input[type="radio"]')) hintAnchor = target.closest<HTMLElement>('fieldset, label') || target
  else if (target.matches('tr, td, th')) hintAnchor = target.closest<HTMLElement>('table') || target
  hintAnchor.insertAdjacentElement('afterend', hint)

  const focusable = 'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
  let focusTarget = target.matches(focusable) ? target : Array.from(target.querySelectorAll<HTMLElement>(focusable)).find(element => element.getClientRects().length > 0) || target
  if (focusTarget instanceof HTMLInputElement && focusTarget.type === 'hidden') focusTarget = target
  const previousTabIndex = focusTarget.getAttribute('tabindex')
  const addedTabIndex = !focusTarget.matches(focusable)
  if (addedTabIndex) focusTarget.setAttribute('tabindex', '-1')
  const describedBy = (focusTarget.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
  focusTarget.setAttribute('aria-describedby', [...describedBy, id].join(' '))
  const isField = focusTarget.matches('input,textarea,select')
  const previousInvalid = focusTarget.getAttribute('aria-invalid')
  if (isField) focusTarget.setAttribute('aria-invalid', 'true')
  target.classList.add('workflow-needs-attention')
  if (feedback) {
    feedback.hidden = false
    feedback.dataset.workflowHint = id
    feedback.textContent = message
    dock?.classList.add('has-feedback')
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  focusTarget.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced ? 'instant' : 'smooth' })

  let cleared = false
  const clear = () => {
    if (cleared) return
    cleared = true
    target.classList.remove('workflow-needs-attention')
    hint.remove()
    const remaining = (focusTarget.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id)
    if (remaining.length) focusTarget.setAttribute('aria-describedby', remaining.join(' '))
    else focusTarget.removeAttribute('aria-describedby')
    if (addedTabIndex && focusTarget.getAttribute('tabindex') === '-1') {
      if (previousTabIndex === null) focusTarget.removeAttribute('tabindex')
      else focusTarget.setAttribute('tabindex', previousTabIndex)
    }
    if (isField && focusTarget.getAttribute('aria-invalid') === 'true') {
      if (previousInvalid === null) focusTarget.removeAttribute('aria-invalid')
      else focusTarget.setAttribute('aria-invalid', previousInvalid)
    }
    if (feedback?.dataset.workflowHint === id) {
      feedback.textContent = ''
      feedback.hidden = true
      delete feedback.dataset.workflowHint
      dock?.classList.remove('has-feedback')
    }
    target.removeEventListener('input', clear)
    target.removeEventListener('change', clear)
    if (activeHighlight === clear) activeHighlight = undefined
  }
  target.addEventListener('input', clear)
  target.addEventListener('change', clear)
  activeHighlight = clear
  return clear
}

/** Reserve exactly the rendered dock height and keep it above the software keyboard. */
export function mountWorkflowDock(root: HTMLElement): () => void {
  const dock = root.matches('#workflow-dock') ? root : root.querySelector<HTMLElement>('#workflow-dock')
  if (!dock) return () => {}
  const documentRoot = document.documentElement
  const previousHeight = documentRoot.style.getPropertyValue('--workflow-dock-height')
  const previousDocked = documentRoot.hasAttribute('data-workflow-docked')
  documentRoot.setAttribute('data-workflow-docked', '')
  let frame = 0
  let disposed = false
  const measure = () => {
    if (disposed || !dock.isConnected) return
    const viewport = window.visualViewport
    const keyboardOffset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0
    dock.style.setProperty('--workflow-keyboard-offset', `${Math.round(keyboardOffset)}px`)
    documentRoot.style.setProperty('--workflow-dock-height', `${Math.ceil(dock.getBoundingClientRect().height)}px`)
  }
  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }
  const observer = new ResizeObserver(schedule)
  observer.observe(dock)
  window.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('scroll', schedule)
  measure()
  return () => {
    disposed = true
    clearWorkflowHighlight()
    cancelAnimationFrame(frame)
    observer.disconnect()
    window.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('scroll', schedule)
    dock.style.removeProperty('--workflow-keyboard-offset')
    if (previousHeight) documentRoot.style.setProperty('--workflow-dock-height', previousHeight)
    else documentRoot.style.removeProperty('--workflow-dock-height')
    if (!previousDocked) documentRoot.removeAttribute('data-workflow-docked')
  }
}
