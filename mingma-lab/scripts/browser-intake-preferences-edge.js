// In-memory component checks. No saved project is modified and no HTTP request is needed.
return (async () => {
  if (location.origin !== 'http://127.0.0.1:5213') throw Error('Use the isolated QA app')
  const { mountIntake } = await import('/shared/intake-ui.ts')
  const { newIntakeState, restoreIntakeState } = await import('/shared/intake-state.ts')
  const checks = [], root = document.createElement('div'); document.body.append(root)
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
  const noWriting = () => !root.querySelector('textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable=true]')
  let raw = JSON.stringify(newIntakeState('旧'.repeat(4000)))
  let adopted = 0
  const model = { recognized: true, drawing: 'test', rooms: [{ id:'bath-b',name:'卫生间 B',bounds:[0,0,3,3],label:[1,1],material:'tile' }], furniture: [{ id:'tub',roomId:'bath-b',kind:'bathtub',bounds:[0,0,1,2],rotation:0,confidence:.8 }] }
  const options = { variant:'lucid', questionnaire:true, initialBrief:'', existingCount:0, activeRoomId:'bath-b', spatialModel:model, storage:{getItem:()=>raw,setItem:(_key,value)=>{raw=value}}, onAdopt:()=>{adopted++} }
  let session = mountIntake(root,options)
  try {
    check(noWriting() && root.querySelector('.preference-history-note').textContent.length === 4000,'Historical text is retained read-only')
    check(root.querySelectorAll('.preference-room').length===2,'Uploaded model supplies room choices')
    check(root.querySelector('.preference-context').textContent.includes('浴缸'),'Recognized furniture is still a retention hint')
    await session.advance()
    while (!root.querySelector('.preference-summary')) await session.advance()
    check(noWriting(),'All-unknown path has no written-answer fallback')
    const issue=await session.advance()
    check(issue?.message.includes('取消本轮引用'),'Long history recovers through a checkbox, not editing text')
    root.querySelector('#preference-include-note').click()
    check(restoreIntakeState(raw).preferences.note.length===4000 && restoreIntakeState(raw).preferences.includeNote===false,'Excluding history does not delete the record')
    check(restoreIntakeState(raw).brief.length<4000,'Request fits after history exclusion')
    session.dispose(); session=mountIntake(root,options)
    check(!root.querySelector('#preference-include-note').checked && noWriting(),'History reference choice restores')
    session.dispose()
    const state=newIntakeState('保留卫生间现有布局')
    const item=(id,blocked)=>({id,title:'需求 '+id,description:'保留现有布局',scope:'area',areas:['卫生间 B'],category:'布局',component:'房间',origin:'user',necessity:'must',clarity:'clear',evidence:[],standards:[],pending:blocked?[{question:'具体边界需要业主决定',owner:'user',kind:'scope',blocking:true}]:[],dependencies:[]})
    state.result={summary:'核对需求',items:[item('safe',false),item('pending',true)],questions:[],conflicts:[],warnings:[],readyForDraft:true,stopReason:''};state.stage='draft'
    raw=JSON.stringify(state);session=mountIntake(root,options)
    check(noWriting(),'Review editor offers no free text')
    await session.advance()
    check(noWriting() && root.querySelector('[data-intake-action="resolve-item"]').textContent.includes('选择题'),'Blocked owner decisions offer more choices')
    const blocked=await session.advance()
    check(!!blocked?.message && adopted===0,'Choice-only UI does not bypass unresolved owner decisions')
    root.querySelector('[data-intake-action="review-defer"]').click()
    check(noWriting() && root.querySelector('.questionnaire-summary'),'Deferral reaches a choice-only summary')
    await session.advance()
    check(adopted===1,'Confirmed scope can be adopted entirely by choice')
    return {passed:checks.length,checks}
  } finally {session.dispose();root.remove()}
})()
