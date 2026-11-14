// Run on #planning with the local Postman dependency's `timeout` scenario
// (a successful response delayed by two seconds). Uses synthetic canvas files.
return (async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const passed = [], errors = []
  const check = (value, label) => { if (!value) throw new Error(label); passed.push(label) }
  const capture = event => errors.push(event.message)
  window.addEventListener('error', capture)
  const originalDecode = Image.prototype.decode
  const upload = async width => {
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = 100
    canvas.getContext('2d').fillRect(0, 0, width, 100)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], `synthetic-${width}.png`, { type: 'image/png' }))
    const input = document.querySelector('[data-plan-upload]')
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  try {
    await upload(100)
    await wait(250)
    check(!!document.querySelector('[aria-busy="true"]'), 'recognition is pending')
    const layer = document.querySelector('[data-plan-mark-layer]')
    layer.setPointerCapture = () => {}
    layer.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 20, clientY: 20 }))
    layer.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, isPrimary: true, clientX: 80, clientY: 80 }))
    check(errors.length === 0, 'dragging during recognition does not access absent coordinate fields')
    Image.prototype.decode = async function () { await originalDecode.call(this); await wait(2500) }
    await upload(200)
    await wait(5000)
    check(document.querySelector('.planning-upload-paper').style.aspectRatio === '2 / 1', 'new image survives an older recognition response during slow decode')
    check(document.querySelectorAll('[data-edit-room]').length === 2, 'new image recognition completes')
    check(errors.length === 0, 'no browser errors during image replacement')
    return passed
  } finally {
    Image.prototype.decode = originalDecode
    window.removeEventListener('error', capture)
  }
})()
