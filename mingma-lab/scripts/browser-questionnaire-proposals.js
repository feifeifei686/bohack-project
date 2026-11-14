// Continue browser-questionnaire-finish.js; sample generation stays entirely local.
return (async () => {
  if (location.hostname !== '127.0.0.1' || location.port !== '5213') throw Error('Use the isolated Postman-backed QA server on port 5213');
  const checks = [], wait = () => new Promise(r => setTimeout(r, 150));
  const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name) };
  const click = async selector => { const el = document.querySelector(selector); if (!el || el.disabled) throw Error(`Unavailable: ${selector}`); el.click(); await wait() };
  await click('[data-action="show-sample"][data-id="a"]');
  check(document.querySelector('#sample-proposal-detail').textContent.includes('温润原木'), 'A sample opens immediately');
  check(document.querySelectorAll('#sample-proposal-detail dt').length === 3, 'Sample replies match published requirements');
  check(!!document.querySelector('.studio-navigation a[href="#space"]'), 'Available scheme unlocks spatial preview');
  await click('[data-action="show-sample"][data-id="b"]');
  check(document.querySelector('#sample-proposal-detail').textContent.includes('清透浅色'), 'B sample switches immediately');
  check(document.querySelectorAll('.comparison thead th').length === 3, 'Both proposals are available for comparison');
  await click('.studio-navigation a[href="#planning"]');
  check(!!document.querySelector('.studio-navigation a[href="#compare"]') && !!document.querySelector('.studio-navigation a[href="#space"]'), 'Going back keeps completed later steps unlocked');
  await click('.studio-navigation a[href="#compare"]');
  await click('#sample-proposal-detail [data-action="select-proposal"]');
  await click('[data-action="confirm-selection"]');
  check(location.hash === '#records', 'Choosing a sample reaches confirmation records');
  check(document.querySelectorAll('.studio-navigation button:disabled').length === 0, 'Completed project allows free navigation');
  await click('.studio-navigation a[href="#compare"]');
  check(!document.querySelector('.merchant-waiting'), 'Viewed current proposals do not revert to waiting');
  return { checks, overflow: document.documentElement.scrollWidth > innerWidth };
})()
