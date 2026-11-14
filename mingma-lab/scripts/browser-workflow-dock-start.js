// Run via browse eval on the isolated Vite/Postman-backed server, never a user's project.
return (async () => {
  if (location.origin !== 'http://127.0.0.1:5231') throw Error('Use isolated QA origin 5231');
  const checks = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) };
  const until = async (fn, label) => { for (let n = 0; n < 150; n++) { if (fn()) return; await wait(100) } throw Error(label) };
  const click = async selector => { const target = document.querySelector(selector); if (!target || target.disabled) throw Error(`Unavailable ${selector}`); target.click(); await wait(100) };
  location.hash = 'planning';
  await until(() => document.querySelector('#workflow-dock'), 'Planning dock mounted');
  check(document.querySelectorAll('#workflow-dock').length === 1, 'One dock on page');
  check(getComputedStyle(document.querySelector('[data-plan-step="build"]')).display === 'none', 'Old build action moved to dock');
  await click('[data-action="workflow-next"]');
  await until(() => document.querySelector('#room-planning')?.dataset.stage === 'model', 'Dock builds the model');
  check(!document.querySelector('[data-action="workflow-next"]').disabled, 'Dock leaves building state');
  await click('[data-planning-room="kitchen"]');
  check(document.querySelector('[data-workflow-title]').textContent.includes('厨房'), 'Dock tracks selected room');
  await click('[data-action="workflow-next"]');
  await until(() => document.querySelector('#intake-brief'), 'Dock enters intake');
  check(!document.querySelector('[data-action="workflow-next"]').disabled, 'Missing input still allows Next for guidance');
  await click('[data-action="workflow-next"]');
  check(document.activeElement.id === 'intake-brief', 'Blank brief receives keyboard focus');
  check(document.querySelector('#intake-brief').classList.contains('workflow-needs-attention'), 'Blank brief highlighted');
  check(!!document.querySelector('.workflow-field-hint'), 'Missing input has explanatory text');
  window.__workflowChecks = checks;
  return { checks, stage: 'blank-brief', overflow: document.documentElement.scrollWidth > innerWidth };
})()
