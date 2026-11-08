/* Journal Club: Google Sheets → Apps Script → Activities */
(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbxJtWIkKf2geBgeAim-xndlqQgvHd4k8qod2_oRASV3iY9JXdoSWsek_-TqTNjxHX63MA/exec';
  const REQUEST_TIMEOUT_MS = 15000;
  const overlay = document.getElementById('journalOverlay');
  const dialog = overlay.querySelector('[role="dialog"]');
  const content = document.getElementById('journalContent');
  const state = document.getElementById('journalState');
  const status = document.getElementById('journalStatus');
  const retry = document.getElementById('journalRetry');
  const sidebar = document.getElementById('journalSidebar');
  const detail = document.getElementById('journalDetail');
  const list = document.getElementById('sessionList');
  const photoGallery = document.getElementById('photoGallery');
  const posterFrame = document.getElementById('posterFrame');
  const placeholderPoster = posterFrame.innerHTML;
  const placeholderGallery = photoGallery.innerHTML;
  let journalSessions = [];
  let lastFocused = null;
  let pendingRequest = null;
  let backgroundElements = [];
  let previousOverflow = '';

  const text = value => String(value ?? '').trim();
  const escapeHTML = value => text(value).replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

  // Sheet values are external input. Only web links and relative asset paths are used.
  function safeURL(value, image = false) {
    const source = text(value);
    if (!source) return null;
    try {
      const url = new URL(source, document.baseURI);
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      if (url.username || url.password) return null;
      if (image && url.hostname === 'drive.google.com') {
        const id = url.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get('id');
        if (id && /^[\w-]+$/.test(id)) {
          const thumbnail = new URL('https://drive.google.com/thumbnail');
          thumbnail.searchParams.set('id', id);
          thumbnail.searchParams.set('sz', 'w1600');
          const resourceKey = url.searchParams.get('resourcekey');
          if (resourceKey) thumbnail.searchParams.set('resourcekey', resourceKey);
          return thumbnail.href;
        }
      }
      return url.href;
    } catch {
      return null;
    }
  }

  function normalizeDate(value) {
    const source = text(value);
    const calendarDate = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (calendarDate) {
      return `${calendarDate[1]}.${calendarDate[2].padStart(2, '0')}.${calendarDate[3].padStart(2, '0')}`;
    }
    // The existing Apps Script serializes date cells with String(Date), rather than ISO JSON dates.
    if (/^\d{4}-\d{2}-\d{2}T/.test(source) || /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s/.test(source)) {
      const date = new Date(source);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(date).replace(/-/g, '.');
      }
    }
    return source || '일정 미정';
  }

  function normalizeSessions(payload) {
    // Use the existing Sheet headers. Lowercase keys also support previously prepared data.
    if (!Array.isArray(payload)) throw new Error('발표 목록 응답이 배열이 아닙니다.');
    return payload.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`${index + 1}번째 발표 데이터 형식이 올바르지 않습니다.`);
      }
      const number = Number(row.Number ?? row.number);
      const title = text(row.Title ?? row.title);
      if (!Number.isSafeInteger(number) || number < 1 || !title) {
        throw new Error(`${index + 1}번째 발표의 Number 또는 Title을 확인해 주세요.`);
      }
      // Multiple presentations may belong to the same Journal Club session number.
      let photos = row.photos;
      if (typeof photos === 'string') {
        photos = photos.trim().startsWith('[') ? JSON.parse(photos) : photos.split(/\r?\n/);
      }
      if (photos != null && !Array.isArray(photos)) throw new Error('photos는 사진 주소 목록이어야 합니다.');
      return {
        number,
        title,
        date: normalizeDate(row.Date ?? row.date),
        speaker: text(row.Presenter ?? row.speaker) || '발표자 미정',
        posterTitle: (text(row.posterTitle) || title).replace(/\\n/g, '\n'),
        poster: safeURL(row['poster(drive link)'] ?? row.poster, true),
        photos: (photos || [row.photo1, row.photo2, row.photo3])
          .map(value => safeURL(value, true)).filter(Boolean).slice(0, 3),
        ppt: safeURL(row.ppt)
      };
    }).sort((a, b) => b.number - a.number);
  }

  function showState(message, canRetry = false) {
    sidebar.hidden = true;
    detail.hidden = true;
    state.hidden = false;
    status.textContent = message;
    retry.hidden = !canRetry;
  }

  function renderPosterPlaceholder(session) {
    posterFrame.innerHTML = placeholderPoster;
    document.getElementById('posterTitle').textContent = session.posterTitle;
    document.getElementById('posterTitle').style.whiteSpace = 'pre-line';
  }

  function createImage(source, description, className) {
    const image = document.createElement('img');
    image.src = source;
    image.alt = description;
    image.className = className;
    image.decoding = 'async';
    return image;
  }

  function selectSession(index) {
    const session = journalSessions[index];
    if (!session) return;
    document.getElementById('sessionTag').textContent =
      `JOURNAL CLUB · SESSION ${String(session.number).padStart(2, '0')}`;
    document.getElementById('sessionCount').textContent =
      `${String(index + 1).padStart(2, '0')} / ${String(journalSessions.length).padStart(2, '0')}`;
    document.getElementById('sessionTitle').textContent = session.title;
    document.getElementById('sessionDate').textContent = session.date;
    document.getElementById('sessionSpeaker').textContent = session.speaker;

    if (session.poster) {
      const image = createImage(session.poster, `${session.title} 포스터`, 'jc-poster-image');
      image.addEventListener('error', () => {
        if (posterFrame.contains(image)) renderPosterPlaceholder(session);
      }, { once: true });
      posterFrame.replaceChildren(image);
    } else {
      renderPosterPlaceholder(session);
    }

    if (session.photos.length) {
      photoGallery.replaceChildren();
      let thumbnails;
      session.photos.forEach((source, photoIndex) => {
        const frame = document.createElement('div');
        frame.className = photoIndex === 0 ? 'jc-gallery-main' : 'jc-gallery-thumb';
        const image = createImage(source, `${session.title} 현장 사진 ${photoIndex + 1}`, 'jc-gallery-image');
        image.addEventListener('error', () => {
          const fallback = document.createElement('p');
          fallback.className = 'jc-media-fallback';
          fallback.textContent = '사진을 불러올 수 없습니다.';
          frame.replaceChildren(fallback);
        }, { once: true });
        frame.appendChild(image);
        if (photoIndex === 0) {
          photoGallery.appendChild(frame);
        } else {
          if (!thumbnails) {
            thumbnails = document.createElement('div');
            thumbnails.className = 'jc-gallery-thumbs';
            photoGallery.appendChild(thumbnails);
          }
          thumbnails.appendChild(frame);
        }
      });
    } else {
      photoGallery.innerHTML = placeholderGallery;
    }

    const slides = document.getElementById('sessionPpt');
    slides.hidden = !session.ppt;
    if (session.ppt) slides.href = session.ppt;
    else slides.removeAttribute('href');

    [...list.querySelectorAll('.jc-session')].forEach((button, buttonIndex) => {
      button.classList.toggle('selected', buttonIndex === index);
      button.setAttribute('aria-current', buttonIndex === index ? 'true' : 'false');
    });
    detail.scrollTop = 0;
  }

  function buildSessions() {
    list.replaceChildren();
    journalSessions.forEach((session, index) => {
      const button = document.createElement('button');
      button.className = 'jc-session';
      button.type = 'button';
      button.innerHTML =
        `<span class="jc-session-number">${session.number.toString().padStart(2, '0')}</span>
         <span class="jc-session-copy">
           <span class="jc-session-date">${escapeHTML(session.date)}</span>
           <span class="jc-session-title">${escapeHTML(session.title)}</span>
         </span>`;
      button.addEventListener('click', () => selectSession(index));
      list.appendChild(button);
    });
    state.hidden = true;
    sidebar.hidden = false;
    detail.hidden = false;
    selectSession(0);
  }

  async function loadSessions() {
    if (pendingRequest) return pendingRequest;
    content.setAttribute('aria-busy', 'true');
    showState('발표 기록을 불러오는 중입니다.');
    pendingRequest = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        // A plain GET follows Apps Script's redirect without a CORS preflight.
        const response = await fetch(API_URL, {
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'follow'
        });
        if (!response.ok) throw new Error(`발표 목록 요청 실패: HTTP ${response.status}`);
        journalSessions = normalizeSessions(await response.json());
        if (journalSessions.length) buildSessions();
        else showState('아직 등록된 발표 기록이 없습니다.', true);
      } catch (error) {
        journalSessions = [];
        list.replaceChildren();
        showState('발표 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
        console.error('Journal Club 데이터를 불러오지 못했습니다.', error);
      } finally {
        clearTimeout(timeout);
        content.setAttribute('aria-busy', 'false');
        pendingRequest = null;
        // Retry can disappear while keyboard focus is on it.
        if (!overlay.hidden && document.activeElement === retry && retry.hidden) dialog.focus();
      }
    })();
    return pendingRequest;
  }

  function openDialog() {
    if (!overlay.hidden) return;
    lastFocused = document.activeElement;
    previousOverflow = document.body.style.overflow;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    backgroundElements = [...document.body.children]
      .filter(element => element !== overlay && !['SCRIPT', 'STYLE'].includes(element.tagName))
      .map(element => ({ element, inert: element.inert }));
    backgroundElements.forEach(({ element }) => { element.inert = true; });
    dialog.focus();
    void loadSessions();
  }

  function closeDialog() {
    overlay.hidden = true;
    document.body.style.overflow = previousOverflow;
    backgroundElements.forEach(({ element, inert }) => { element.inert = inert; });
    lastFocused?.focus?.();
  }

  document.getElementById('openJournalClub').addEventListener('click', openDialog);
  document.getElementById('journalClose').addEventListener('click', closeDialog);
  retry.addEventListener('click', () => { dialog.focus(); void loadSessions(); });
  overlay.addEventListener('mousedown', event => { if (event.target === overlay) closeDialog(); });
  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href]:not([hidden])')]
      .filter(element => element.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
      event.preventDefault(); first.focus();
    }
  });
})();
