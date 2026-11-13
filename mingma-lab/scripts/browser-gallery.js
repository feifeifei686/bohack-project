return (async () => {
  const results=[]
  const wait=()=>new Promise(r=>setTimeout(r,100))
  const check=(value,label)=>{if(!value)throw Error(label);results.push(label)}
  const select=document.querySelector('#edition-select')
  check(!!select,'Gallery acceptance version selector exists')
  select.value='lucid';select.dispatchEvent(new Event('change',{bubbles:true}));await wait()
  check([...document.querySelectorAll('[data-route]')].every(a=>a.href.includes('/versions/lucid/')),'All acceptance links follow selected version')
  document.querySelector('#reset-checks').click()
  const box=document.querySelector('[data-check="1"]');box.click();await wait()
  check(document.querySelector('#check-summary').textContent.includes('1 / 8'),'Checklist updates its completed count')
  select.value='atelier';select.dispatchEvent(new Event('change',{bubbles:true}));await wait()
  document.querySelector('#reset-checks').click()
  check(!document.querySelector('[data-check="1"]').checked,'Checklist state is isolated per version')
  select.value='lucid';select.dispatchEvent(new Event('change',{bubbles:true}));await wait()
  check(document.querySelector('[data-check="1"]').checked,'Checklist restores the previous version state')
  for(const id of ['atmosphere','lucid','atelier']){
    document.querySelector(`[data-mobile="${id}"]`).click();await wait()
    const img=document.querySelector('#mobile-preview-image');await img.decode()
    check(document.querySelector('#mobile-preview').open&&img.naturalWidth>0,`${id} mobile preview opens real image`)
    document.querySelector('#close-preview').click()
  }
  for(const img of [...document.images].filter(i=>i.getAttribute('src'))){img.loading='eager';await img.decode()}
  check([...document.images].filter(i=>i.getAttribute('src')).every(i=>i.complete&&i.naturalWidth>0),'All gallery image assets load')
  check(document.documentElement.scrollWidth<=innerWidth,'Gallery has no page overflow')
  return results
})()
