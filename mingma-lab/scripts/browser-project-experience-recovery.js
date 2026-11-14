return (async () => {
  if (location.hostname !== '127.0.0.1' || location.port !== '5214') throw Error('Run only on isolated QA port 5214');
  const frame = document.querySelector('.project-report-frame');
  frame?.contentDocument?.querySelector('[data-report-close]')?.click();
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open('anju-project-drafts', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) });
  const read = () => new Promise((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').get('current'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) });
  const write = value => new Promise((resolve, reject) => { const transaction = db.transaction('projects', 'readwrite'); transaction.objectStore('projects').put(value, 'current'); transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error) });
  const key = 'experience-qa-backup';
  const raw = await read();
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, JSON.stringify(raw));
    raw.data.state.assessments = [{ targetKey: 'draft', dimensions: [null], issues: [null], notes: [] }];
    raw.revision = crypto.randomUUID();
    await write(raw); db.close();
    return { seeded: 'Malformed nested assessment fixture', reloadNext: true };
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  if (!document.querySelector('.project-recovery')?.textContent.includes('原记录')) throw Error('Recovery must show an actionable error');
  const unchanged = await read();
  if (unchanged.data.state.assessments[0].dimensions[0] !== null) throw Error('Damaged draft was overwritten');
  if (!document.querySelector('[data-action="export-recovery"]')) throw Error('Raw export recovery path missing');
  const backup = JSON.parse(sessionStorage.getItem(key)); backup.revision = crypto.randomUUID();
  await write(backup); sessionStorage.removeItem(key); db.close();
  return { checks: ['Malformed nested records show recovery notice', 'Automatic saving does not overwrite damaged records', 'Original record export and retry remain available'], restoredFixture: true, reloadNext: true };
})()
