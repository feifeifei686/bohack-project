// Run in a newly opened wall view. No wall type is inferred from the demo geometry.
return (async()=>{
  const passed=[],wait=ms=>new Promise(r=>setTimeout(r,ms))
  const check=(condition,label)=>{if(!condition)throw Error(label);passed.push(label)}
  const click=s=>document.querySelector(s).click()
  const changeType=value=>{const field=document.querySelector('[data-wall-type]');field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}))}
  const selected=()=>document.querySelector('.wall-piece.is-selected')
  check([...document.querySelectorAll('.wall-piece')].every(w=>w.dataset.wallKind==='unknown'),'all initial wall types remain unknown')
  const first=selected().dataset.wallPiece
  click('[data-wall-action="mark"]');click('[data-wall-action="preview"]');await wait(650)
  check(Number(getComputedStyle(selected()).opacity)<.1,'unverified intent can be previewed without claiming structural certainty')
  changeType('bearing');await wait(650)
  check(selected().dataset.wallKind==='bearing','bearing type is applied to the selected wall')
  check(!selected().classList.contains('is-marked'),'bearing annotation cancels an existing demolition intent')
  check(document.querySelector('[data-wall-action="mark"]').disabled,'bearing demolition button is disabled')
  check(Number(getComputedStyle(selected()).opacity)>.9,'bearing wall reappears after annotation during preview')
  check(document.querySelector(`[data-wall-label="${first}"] text`).textContent.includes('承重'),'bearing text is visible on the model label')
  document.querySelector('[data-wall-action="mark"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))
  check(!selected().classList.contains('is-marked'),'handler also rejects forced demolition events for bearing walls')
  const note='<img src=x onerror="window.__wallNoteExecuted=true">'
  const noteField=document.querySelector('[data-wall-evidence]');noteField.value=note;noteField.dispatchEvent(new Event('input',{bubbles:true}))
  const second=[...document.querySelectorAll('[data-wall-select]')].find(w=>w.dataset.wallSelect!==first).dataset.wallSelect
  click(`[data-wall-select="${second}"]`);changeType('partition')
  check(selected().dataset.wallKind==='partition'&&!document.querySelector('[data-wall-action="mark"]').disabled,'partition annotation is distinct and retains intent control')
  check(document.querySelector('.wall-type-origin').textContent.includes('人工标注'),'manual provenance stays visible')
  click('[data-wall-action="mark"]');click('[data-wall-action="clear"]')
  check(document.querySelector(`[data-wall-piece="${first}"]`).dataset.wallKind==='bearing','clearing demolition intents preserves structural annotations')
  click(`[data-wall-select="${first}"]`)
  check(document.querySelector('[data-wall-evidence]').value===note&&!document.querySelector('.wall-selection img')&&!window.__wallNoteExecuted,'evidence note is preserved as escaped text')
  const cleanNote=document.querySelector('[data-wall-evidence]');cleanNote.value='本轮人工标注示例，待专业核实';cleanNote.dispatchEvent(new Event('input',{bubbles:true}))
  click('[data-wall-action="back"]');click('[data-plan-step="walls"]')
  check(document.querySelector(`[data-wall-piece="${first}"]`).dataset.wallKind==='bearing','reopening keeps annotations in the current session')
  check(document.querySelector('[data-wall-structure-count]').textContent.includes('承重 1'),'structure counts match the annotations')
  check(document.documentElement.scrollWidth<=innerWidth,'annotated view has no horizontal overflow')
  return passed
})()
