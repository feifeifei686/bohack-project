// Isolated QA browser, Vite pointed at the real API with the local Postman dependency.
return (async () => {
  if (location.hostname !== '127.0.0.1' || location.port !== '5213') throw Error('Use the isolated Postman-backed QA server on port 5213');
  const checks = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => { for (let n = 0; n < 200; n++) { if (fn()) return; await wait(100) } throw Error(label) };
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) };
  const click = async selector => { const el = document.querySelector(selector); if (!el || el.disabled) throw Error(`Unavailable: ${selector}`); el.click(); await wait(100) };
  const fill = (selector, text) => { const el = document.querySelector(selector); el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })) };
  check(document.querySelectorAll('.studio-navigation button:disabled').length === 5, 'Future steps are visibly locked');
  location.hash = 'compare'; await wait(150);
  check(location.hash === '#planning', 'Direct future URL returns to the current unlocked step');
  await click('[data-plan-step="build"]');
  await until(() => document.querySelector('#room-planning')?.dataset.stage === 'model', 'House built');
  await click('[data-action="plan-whole-home"]');
  await until(() => document.querySelector('#intake-brief'), 'Questionnaire mounted');
  check(document.querySelectorAll('[data-intake-action="wizard-stage"]:disabled').length === 3, 'Future questionnaire steps locked');
  fill('#intake-brief', '厨房想好打理，加一台洗碗机；客厅和走道地面想连贯，水电我不太懂。');
  await click('[data-intake-action="start"]');
  await until(() => document.querySelector('[data-intake-choice="油污擦拭"]'), 'First question from real API');
  await click('[data-intake-choice="油污擦拭"]');
  await click('[data-intake-action="answer"]');
  await until(() => document.querySelector('[data-intake-choice="交界自然"]'), 'Second question');
  check(document.querySelector('.questionnaire-question-progress').textContent.includes('2 / 2'), 'Question count advances');
  await click('[data-intake-action="previous-question"]');
  check(document.querySelector('[data-intake-choice="油污擦拭"]').checked, 'Previous answer remains editable');
  await click('[data-intake-action="answer"]');
  await click('[data-intake-choice="交界自然"]');
  await click('[data-intake-action="answer"]');
  await until(() => document.querySelector('[data-intake-item="N001"]'), 'Review follows latest AI result');
  check(document.querySelectorAll('[data-intake-item]').length === 1, 'Only one requirement visible at a time');
  check(!document.querySelector('.questionnaire-technical').open, 'Technical details collapsed by default');
  check(document.querySelector('[data-intake-action="wizard-stage"][data-intake-id="3"]').disabled, 'Submission remains locked before review');
  return { checks, stage: 'review', width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
})()
