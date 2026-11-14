return (async () => {
  if (location.hostname !== '127.0.0.1' || location.port !== '5214') throw Error('Run only against the isolated experience QA server on 5214');
  const checks = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, label) => { for (let n = 0; n < 150; n++) { if (fn()) return; await wait(100) } throw Error(label) };
  const check = (condition, label) => { if (!condition) throw Error(label); checks.push(label) };
  const click = selector => { const el = document.querySelector(selector); if (!el || el.disabled) throw Error(`Unavailable: ${selector}`); el.click() };
  await until(() => document.querySelector('.home-outcome'), 'Homepage ready');
  if (document.querySelector('[data-action="resume-project"]')) {
    click('[data-action="about"]'); click('[data-action="reset"]'); click('[data-action="confirm-reset"]');
    await until(() => !document.querySelector('[data-action="resume-project"]') && !document.querySelector('dialog[open]'), 'QA project reset');
  }
  check(document.querySelector('.home-outcome').textContent.includes('供水'), 'Homepage shows a concrete expression-to-outcome example');
  click('.home-navigation [data-destination="clarify"]');
  await until(() => document.querySelector('[data-plan-step="build"]'), 'Guided entry opens planning');
  check(location.hash === '#planning', 'Unavailable step guides to the available first step');
  check(document.querySelector('[data-plan-step="build"]').getBoundingClientRect().bottom < innerHeight, 'Build action is fully visible in desktop first viewport');
  click('[data-plan-step="build"]');
  await until(() => document.querySelector('#room-planning')?.dataset.stage === 'model', 'Model generated');
  click('[data-planning-room="bathroom"]');
  click('[data-action="plan-current-room"]');
  await until(() => document.querySelector('#intake-brief'), 'Intake mounted');
  check(document.querySelector('[data-project-scope]').textContent.includes('卫生间'), 'Header follows the selected room');
  check(document.querySelector('#intake-brief').placeholder.includes('卫生间'), 'Expression example follows selected room');
  check(document.querySelector('[data-intake-action="start"]').getBoundingClientRect().bottom < innerHeight, 'Intake next action fits desktop first viewport');
  click('[data-intake-action="sample"]');
  const field = document.querySelector('#intake-brief');
  check(field.value.includes('卫生间'), 'Sample button inserts the room-specific example');
  field.value = '卫生间想做干湿分离，保留浴室柜，地面要防滑。刷新恢复验收。';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(450);
  await until(() => document.querySelector('[data-project-save]')?.textContent.includes('已保存'), 'Draft saved');
  check(document.documentElement.scrollWidth <= innerWidth, 'Desktop intake does not overflow');
  return { checks, reloadNext: true, expression: field.value };
})()
