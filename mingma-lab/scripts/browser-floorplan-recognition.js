// Run with the local Postman simulation after uploading an image and building the candidate model.
return (async()=>{
 const passed=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(x,label)=>{if(!x)throw Error(label);passed.push(label)},click=s=>document.querySelector(s).click();
 check(document.querySelector('.room-planning').dataset.stage==='model','build animation settled');
 click('[data-planning-room="bedroom"]');await wait(600);
 check(document.querySelector('.planning-room.is-selected').dataset.floorRoom==='bedroom','room switch selects correct polygon');
 check(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-floor-room="bedroom"]')).transform).m42<0,'selected room lifts');
 click('[data-plan-step="drawing"]');
 const room=document.querySelector('[data-edit-room="bedroom"]');room.querySelector('[data-edit-name]').value='测试卧室';room.querySelector('[data-plan-analysis="save-room"]').click();
 check(document.querySelector('[data-edit-room="bedroom"] [data-edit-name]').value==='测试卧室','room rename preserved');
 const furniture=document.querySelector('[data-edit-furniture="bed1"]');furniture.querySelector('[data-edit-rotation]').value='180';furniture.querySelector('[data-plan-analysis="save-furniture"]').click();
 check(document.querySelector('[data-edit-furniture="bed1"] [data-edit-rotation]').value==='180','furniture rotation persisted');
 click('[data-plan-step="build"]');await wait(200);
 check(document.querySelector('.planning-build-paper')&&document.querySelector('.planning-layout').inert,'replay uses source sheet and locks transient controls');await wait(2600);
 click('[data-action="plan-current-room"]');await wait(1600);
 check(location.hash==='#clarify','custom floorplan enters questionnaire');
 check(document.querySelector('.intake-space [data-plan-furniture="bed1"]'),'furniture carried into questionnaire preview');
 check(document.body.textContent.includes('测试卧室'),'custom room name carried to questionnaire');
 return passed;
})()
