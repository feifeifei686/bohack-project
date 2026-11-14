return (async () => {
  if (location.hostname !== '127.0.0.1' || location.port !== '5214') throw Error('Run only on isolated QA port 5214');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => { for (let n = 0; n < 100; n++) { if (fn()) return; await wait(100) } throw Error(label) };
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open('anju-project-drafts', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) });
  const read = () => new Promise((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').get('current'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) });
  const raw = await read();
  if (!raw?.data?.state?.snapshots?.length) throw Error('Run the complete demo experience test first');
  if (raw.data.planning.model.rooms.find(room => room.id === 'kitchen')?.name !== '验收厨房') {
    const model = raw.data.planning.model;
    model.drawing = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    model.drawingAspect = 10 / 7.4;
    model.rooms.find(room => room.id === 'kitchen').name = '验收厨房';
    model.rooms.find(room => room.id === 'kitchen').previousNames = ['厨房'];
    raw.data.planning.selectedRoomId = 'kitchen'; raw.data.planning.stage = 'model';
    raw.data.selectedProjectRoom = 'kitchen'; raw.data.lastWorkspacePage = 'space';
    const { buildWallPieces } = await import('/shared/wall-demolition-data.ts');
    const { planningWallSegments } = await import('/shared/planning-floorplan.ts');
    const walls = buildWallPieces(model, planningWallSegments(model));
    raw.data.planning.walls.annotations = [[walls[0].id, { type: 'bearing', note: '恢复验收：待专业复核' }]];
    raw.data.planning.walls.marked = [walls[1].id];
    raw.data.planning.walls.wallId = walls[0].id;
    raw.revision = crypto.randomUUID();
    await new Promise((resolve, reject) => { const transaction = db.transaction('projects', 'readwrite'); transaction.objectStore('projects').put(raw, 'current'); transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error) });
    db.close();
    return { seeded: 'Uploaded-image, room alias, bearing annotation and removal intention fixture', reloadNext: true };
  }
  db.close();
  await until(() => document.querySelector('.project-space'), 'Current uploaded plan restored');
  const checks = [];
  const check = (value, label) => { if (!value) throw Error(label); checks.push(label) };
  check(document.querySelector('.project-space-source').textContent.includes('你的上传户型'), 'Uploaded model remains the default space source');
  check(document.querySelector('[data-project-room="kitchen"]').textContent === '验收厨房', 'Renamed room survives reload');
  check(document.querySelectorAll('.project-space-needs li').length === 6, 'Room aliases retain requirement associations');
  check(raw.data.planning.model.drawing.startsWith('data:image/png;base64,'), 'Original image survives IndexedDB round trip');
  document.querySelector('[data-action="space-walls"]').click();
  await until(() => document.querySelector('.wall-explorer'), 'Wall view ready');
  check(document.querySelector('[data-wall-type]').value === 'bearing', 'Bearing annotation survives reload');
  check(document.querySelector('[data-wall-evidence]').value.includes('恢复验收'), 'Wall note survives reload');
  check(document.querySelector('[data-wall-action="mark"]').disabled, 'Bearing wall still cannot be marked for removal');
  check(raw.data.planning.walls.marked.length === 1, 'Removal intention on another wall survives');
  return { checks };
})()
