const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// A small DOM fixture exercises the shipped script through its actual click handlers.
// This fixture does not verify layout, image decoding or browser CORS behavior.
class Element {
  constructor(id, document) {
    this.id = id;
    this.document = document;
    this.tagName = 'DIV';
    this.hidden = false;
    this.inert = false;
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.events = {};
    this.innerHTML = '';
    this.textContent = '';
    this.className = '';
    this.classList = { toggle() {} };
  }
  addEventListener(name, callback) { this.events[name] = callback; }
  click() { this.events.click?.({ target: this }); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; delete this[name]; }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; this.innerHTML = ''; }
  contains(child) { return this.children.includes(child); }
  focus() { this.document.activeElement = this; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  querySelector() { return this.document.dialog; }
  querySelectorAll(selector) {
    return selector === '.jc-session' ? this.children : [this.document.elements.journalClose];
  }
}

function createPage(fetchImpl, timers = {}) {
  const document = { elements: {}, baseURI: 'https://pqr.example/activities.html', events: {} };
  document.getElementById = id => document.elements[id];
  document.createElement = () => new Element('', document);
  document.addEventListener = (name, callback) => { document.events[name] = callback; };
  const html = fs.readFileSync(path.join(__dirname, '../activities.html'), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) document.elements[id] = new Element(id, document);
  document.body = new Element('body', document);
  document.dialog = new Element('dialog', document);
  document.body.children = [document.elements['site-shell'], document.elements.footer, document.elements.journalOverlay];
  document.elements.journalOverlay.hidden = true;
  document.elements.posterFrame.innerHTML = '<placeholder-poster>';
  document.elements.photoGallery.innerHTML = '<placeholder-photos>';
  document.activeElement = document.elements.openJournalClub;
  const errors = [];
  const context = vm.createContext({
    document, fetch: fetchImpl, URL, Intl, AbortController,
    setTimeout: timers.setTimeout || setTimeout,
    clearTimeout: timers.clearTimeout || clearTimeout,
    console: { error: (...args) => errors.push(args) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../journal-club.js'), 'utf8'), context);
  return { document, elements: document.elements, errors };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const response = body => ({ ok: true, json: async () => body });
const session = (number, extra = {}) => ({ number, title: `Session ${number}`, date: '2026-11-08', speaker: '발표자', ...extra });

test('opening requests the live URL, renders descending sessions, and restores focus on close', async () => {
  const calls = [];
  const page = createPage(async (...args) => {
    calls.push(args);
    return response([session(2), session(7), session(1)]);
  });
  const { elements, document } = page;
  elements.openJournalClub.click();
  assert.equal(elements.journalOverlay.hidden, false);
  assert.equal(elements.journalStatus.textContent, '발표 기록을 불러오는 중입니다.');
  assert.equal(elements['site-shell'].inert, true);
  await settle();
  assert.match(calls[0][0], /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(calls[0][1].redirect, 'follow');
  assert.equal(elements.journalState.hidden, true);
  assert.equal(elements.sessionList.children.length, 3);
  assert.equal(elements.sessionTitle.textContent, 'Session 7');
  assert.equal(elements.sessionCount.textContent, '01 / 03');
  assert.equal(elements.sessionDate.textContent, '2026.11.08');
  elements.sessionList.children[1].click();
  assert.equal(elements.sessionTitle.textContent, 'Session 2');
  assert.equal(elements.sessionCount.textContent, '02 / 03');
  elements.journalClose.click();
  assert.equal(elements.journalOverlay.hidden, true);
  assert.equal(elements['site-shell'].inert, false);
  assert.equal(document.activeElement, elements.openJournalClub);
  elements.openJournalClub.click();
  await settle();
  assert.equal(calls.length, 2, 'reopening reads fresh Sheet data');
});

test('an empty sheet shows an empty state and retry reads newly added rows', async () => {
  let rows = [];
  const { elements } = createPage(async () => response(rows));
  elements.openJournalClub.click();
  await settle();
  assert.equal(elements.journalDetail.hidden, true);
  assert.match(elements.journalStatus.textContent, /아직 등록된 발표/);
  assert.equal(elements.journalRetry.hidden, false);
  rows = [session(1)];
  elements.journalRetry.click();
  await settle();
  assert.equal(elements.sessionTitle.textContent, 'Session 1');
  assert.equal(elements.journalDetail.hidden, false);
});

test('network, HTTP, non-JSON, API errors and invalid rows show retry without stale records', async () => {
  const cases = [
    async () => { throw new TypeError('network unavailable'); },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML login page'); } }),
    async () => response({ error: 'missing sheet' }),
    async () => response([session(1), session(1)]),
    async () => response([{ title: 'Missing number' }]),
    async () => response([session(1, { photos: '[bad json' })])
  ];
  for (const fetchImpl of cases) {
    let fail = false;
    const { elements, errors } = createPage((...args) => fail ? fetchImpl(...args) : Promise.resolve(response([session(1)])));
    elements.openJournalClub.click();
    await settle();
    elements.journalClose.click();
    fail = true;
    elements.openJournalClub.click();
    await settle();
    assert.match(elements.journalStatus.textContent, /불러오지 못했습니다/);
    assert.equal(elements.journalRetry.hidden, false);
    assert.equal(elements.journalDetail.hidden, true);
    assert.equal(elements.sessionList.children.length, 0);
    assert.equal(elements.journalContent.attributes['aria-busy'], 'false');
    assert.equal(errors.length, 1);
  }
});

test('timeout aborts the request and concurrent reopening shares the pending request', async () => {
  let abortRequest;
  let calls = 0;
  const { elements } = createPage((_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  }, { setTimeout: callback => { abortRequest = callback; return 1; }, clearTimeout() {} });
  elements.openJournalClub.click();
  elements.journalClose.click();
  elements.openJournalClub.click();
  assert.equal(calls, 1);
  abortRequest();
  await settle();
  assert.match(elements.journalStatus.textContent, /불러오지 못했습니다/);
  assert.equal(elements.journalRetry.hidden, false);
});

test('untrusted cell text is escaped and executable URLs are ignored', async () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const { elements } = createPage(async () => response([session(1, {
    title: malicious, poster: 'javascript:alert(1)', photos: ['data:image/svg+xml,<svg/>'], ppt: 'javascript:alert(2)'
  })]));
  elements.openJournalClub.click();
  await settle();
  assert.equal(elements.sessionTitle.textContent, malicious);
  assert.match(elements.sessionList.children[0].innerHTML, /&lt;img/);
  assert.equal(elements.posterFrame.children.length, 0);
  assert.equal(elements.photoGallery.innerHTML, '<placeholder-photos>');
  assert.equal(elements.sessionPpt.hidden, true);
  assert.equal(elements.sessionPpt.href, undefined);
});

test('Drive image URLs, photos JSON, slides, ISO dates and late image errors are handled', async () => {
  const { elements } = createPage(async () => response([
    session(2, {
      date: '2026-11-07T15:00:00.000Z', poster: 'https://drive.google.com/file/d/abc123/view?resourcekey=key',
      photos: '["https://example.com/a.jpg","https://example.com/b.jpg"]', ppt: 'https://docs.google.com/presentation/d/slides/edit'
    }),
    session(1, { posterTitle: 'FIRST\\nSESSION' })
  ]));
  elements.openJournalClub.click();
  await settle();
  const image = elements.posterFrame.children[0];
  assert.equal(image.src, 'https://drive.google.com/thumbnail?id=abc123&sz=w1600&resourcekey=key');
  assert.equal(elements.sessionDate.textContent, '2026.11.08');
  assert.equal(elements.photoGallery.children.length, 2);
  assert.equal(elements.sessionPpt.hidden, false);
  elements.sessionList.children[1].click();
  // This fixture does not parse innerHTML, so clear its children as the real DOM would.
  elements.posterFrame.children = [];
  image.events.error();
  assert.equal(elements.posterTitle.textContent, 'FIRST\nSESSION');
  assert.equal(elements.sessionPpt.hidden, true);
  assert.equal(elements.sessionPpt.href, undefined);
});

test('the current Apps Script string fields use the existing A–J headers without backend changes', async () => {
  const rows = [
    {
      Number: '2', Title: 'Second talk', Date: '2026.11.01', Presenter: 'First presenter',
      posterTitle: '', 'poster(drive link)': '', photo1: '', photo2: '', photo3: '', ppt: ''
    },
    {
      Number: '3', Title: 'Quantum Entanglement & Bell Tests',
      Date: 'Sun Nov 08 2026 00:00:00 GMT+0900 (Korean Standard Time)', Presenter: '발표자 이름',
      posterTitle: 'QUANTUM\\nENTANGLEMENT',
      'poster(drive link)': 'https://drive.google.com/file/d/poster123/view',
      photo1: 'https://example.com/photo1.jpg', photo2: '', photo3: 'https://example.com/photo3.jpg',
      ppt: 'https://docs.google.com/presentation/d/slides/view'
    }
  ];
  const { elements, errors } = createPage(async () => response(rows));
  elements.openJournalClub.click();
  await settle();
  assert.equal(errors.length, 0);
  assert.equal(elements.journalState.hidden, true);
  assert.equal(elements.sessionTitle.textContent, rows[1].Title);
  assert.equal(elements.sessionSpeaker.textContent, '발표자 이름');
  assert.equal(elements.sessionDate.textContent, '2026.11.08');
  assert.equal(elements.posterFrame.children[0].src, 'https://drive.google.com/thumbnail?id=poster123&sz=w1600');
  assert.equal(elements.photoGallery.children[0].children[0].src, rows[1].photo1);
  assert.equal(elements.photoGallery.children[1].children[0].children[0].src, rows[1].photo3);
  assert.equal(elements.sessionPpt.href, rows[1].ppt);
  assert.equal(elements.sessionPpt.hidden, false);
  elements.posterFrame.children[0].events.error();
  assert.equal(elements.posterTitle.textContent, 'QUANTUM\nENTANGLEMENT');
  elements.sessionList.children[1].click();
  assert.equal(elements.sessionTitle.textContent, 'Second talk');
  assert.equal(elements.posterTitle.textContent, 'Second talk');
  assert.equal(elements.sessionPpt.hidden, true);
});

test('current Sheet date text and empty optional cells display correctly', async () => {
  const { elements } = createPage(async () => response([{
    Number: '1', Title: 'First talk', Date: '2026/1/2', Presenter: '',
    posterTitle: '', 'poster(drive link)': '', photo1: '', photo2: '', photo3: '', ppt: ''
  }]));
  elements.openJournalClub.click();
  await settle();
  assert.equal(elements.sessionDate.textContent, '2026.01.02');
  assert.equal(elements.sessionSpeaker.textContent, '발표자 미정');
  assert.equal(elements.posterTitle.textContent, 'First talk');
  assert.equal(elements.photoGallery.innerHTML, '<placeholder-photos>');
  assert.equal(elements.sessionPpt.hidden, true);
});
