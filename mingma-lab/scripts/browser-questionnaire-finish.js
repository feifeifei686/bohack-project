// Continue browser-questionnaire-start.js in the same isolated page.
return (async () => {
  if (location.hostname !== '127.0.0.1' || location.port !== '5213') throw Error('Use the isolated Postman-backed QA server on port 5213');
  const checks = [], wait = ms => new Promise(r => setTimeout(r, ms));
  const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name) };
  const click = async selector => { const el = document.querySelector(selector); if (!el || el.disabled) throw Error(`Unavailable: ${selector}`); el.click(); await wait(150) };
  await click('[data-intake-action="review-confirm"]');
  check(!!document.querySelector('[data-intake-item="N002"]'), 'Confirm advances one item');
  await click('[data-intake-action="review-confirm"]');
  await click('[data-intake-action="review-confirm"]');
  check(!!document.querySelector('[data-intake-item="N004"]'), 'Suggestion and next user item reviewed');
  const priority = document.querySelector('[data-intake-edit="necessity"]');
  priority.value = 'must'; priority.dispatchEvent(new Event('change', { bubbles: true }));
  check(document.querySelector('[data-intake-action="review-confirm"]').disabled, 'Unassigned mandatory item cannot be confirmed');
  check(document.querySelector('.questionnaire-resolution').textContent.includes('决定'), 'Blocked item explains how to proceed');
  await click('[data-intake-action="resolve-item"]');
  check(document.querySelector('.intake-editor').open, 'Resolution opens the relevant editor');
  await click('[data-intake-action="review-defer"]');
  check(document.querySelectorAll('.questionnaire-summary li').length === 4, 'Summary retains deferred item');
  check(!document.querySelector('[data-intake-action="adopt"]').disabled, 'Reviewed subset is ready to submit');
  await click('[data-intake-action="adopt"]');
  check(location.hash === '#requirements', 'Questionnaire submission enters my requirements');
  check(document.querySelectorAll('[data-intake-adopted]').length === 3, 'Explicit suggestion accepted, deferred item excluded');
  check(!document.querySelector('.studio-navigation a[href="#compare"]'), 'Comparison locked until requirements published');
  await click('[data-action="publish"]');
  await click('[data-action="confirm-publish"]');
  check(location.hash === '#requirements' && !!document.querySelector('.requirement-insight'), 'Publishing opens the second-pass Flash analysis');
  await click('[data-action="insight-continue"]');
  check(location.hash === '#compare', 'Publishing enters scheme waiting page');
  check(document.querySelector('.merchant-waiting').textContent.includes('商家正在制作'), 'Waiting message precedes sample display');
  check(document.querySelectorAll('.proposal-sample').length === 2, 'Two ready-made examples available');
  check(!document.querySelector('.comparison'), 'No pretend received proposals before click');
  return { checks, stage: 'waiting', overflow: document.documentElement.scrollWidth > innerWidth };
})()
