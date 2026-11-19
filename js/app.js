(function () {
  'use strict';

  const S = window.SCHEDULE;
  const STUDY_MIN = 50; // mỗi khung học 50 phút
  const SKILLS = ['Từ vựng', 'Ngữ pháp', 'Nghe', 'Đọc', 'Viết', 'Nói', 'Thi thử', 'Ôn lỗi'];
  const SKILL_CLASS = {
    'Từ vựng': 'sk-vocab', 'Ngữ pháp': 'sk-gram', 'Nghe': 'sk-listen', 'Đọc': 'sk-read',
    'Viết': 'sk-write', 'Nói': 'sk-speak', 'Thi thử': 'sk-test', 'Ôn lỗi': 'sk-review'
  };
  const SKILL_COLOR = {
    'Từ vựng': 'var(--c-vocab-fg)', 'Ngữ pháp': 'var(--c-gram-fg)', 'Nghe': 'var(--c-listen-fg)',
    'Đọc': 'var(--c-read-fg)', 'Viết': 'var(--c-write-fg)', 'Nói': 'var(--c-speak-fg)',
    'Thi thử': 'var(--c-test-fg)', 'Ôn lỗi': 'var(--c-review-fg)'
  };
  const KEY = 'englishTracker.v1';
  // Claude Project dùng cho mọi khung Nói, Viết
  const CLAUDE_URL = 'https://claude.ai/project/01a1f4b7-4063-77c3-8fd1-8cc2fe99800f';
  const POS = ['danh từ', 'động từ', 'tính từ', 'trạng từ', 'giới từ', 'liên từ', 'cụm từ', 'thành ngữ', 'cụm động từ'];

  // ---------- Lưu trữ ----------
  function emptyState() {
    return { version: 1, logs: [], vocab: [], settings: { sheetUrl: '', ieltsTarget: '', toeicTarget: '', examDate: '' } };
  }
  function normalize(d) {
    return {
      version: 1,
      logs: Array.isArray(d.logs) ? d.logs : [],
      vocab: Array.isArray(d.vocab) ? d.vocab : [],
      settings: Object.assign(emptyState().settings, d.settings || {})
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyState();
    } catch (e) { return emptyState(); }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Không lưu được vào trình duyệt. Hãy xuất file JSON để giữ dữ liệu.'); }
  }

  // ---------- Thời gian ----------
  // Có thể giả lập thời điểm để thử: index.html?now=2026-11-20T09:15
  const fakeNow = new URLSearchParams(location.search).get('now');
  const fakeOffset = fakeNow && !isNaN(new Date(fakeNow)) ? new Date(fakeNow) - Date.now() : 0;
  const now = () => new Date(Date.now() + fakeOffset);

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dayIdx = d => (d.getDay() + 6) % 7; // 0 = Thứ 2
  const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -dayIdx(x)); };
  const dmy = s => { const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
  const dm = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  const minsOfDay = d => d.getHours() * 60 + d.getMinutes();
  const slotsOf = d => S.slots[dayIdx(d)];
  const slotLabel = s => s.start + ' - ' + s.end;

  // ---------- Tiện ích ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const skillClass = s => SKILL_CLASS[s] || 'sk';
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const fmtHours = m => { const h = m / 60; return (Math.round(h * 10) / 10).toLocaleString('vi-VN'); };

  function findLog(date, start) { return state.logs.find(l => l.date === date && l.start === start); }

  function slotStatus(date, slot) {
    if (slot.type !== 'study') return 'off';
    if (findLog(date, slot.start)) return 'done';
    const n = now(); const today = ymd(n);
    if (date < today || (date === today && minsOfDay(n) >= slot.endMin)) return 'missed';
    if (date === today && minsOfDay(n) >= slot.startMin) return 'now';
    return 'upcoming';
  }

  function resolveLink(slot) {
    if (slot.link === '@sheet') return state.settings.sheetUrl || '';
    return slot.link || '';
  }
  function appButtonText(slot) {
    return slot.app === 'Bảng tính này' ? 'Mở Google Sheet' : 'Mở ' + slot.app;
  }

  // Nút cho 1 khung học
  function slotButtons(date, slot) {
    const link = resolveLink(slot);
    const log = findLog(date, slot.start);
    let html = '';
    if (slot.claude) {
      html += `<a class="btn primary" href="${CLAUDE_URL}" target="_blank" rel="noopener">Học với Claude</a>`;
      if (link) html += `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Lấy đề</a>`;
    } else if (link) {
      html += `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">${esc(appButtonText(slot))}</a>`;
    } else if (slot.link === '@sheet') {
      html += `<a class="btn" href="#settings">Nhập link Google Sheet</a>`;
    }
    html += `<button class="btn ${log ? 'done' : ''}" data-act="log" data-date="${date}" data-start="${slot.start}">${log ? '✓ Sửa ghi chép' : 'Ghi đã học'}</button>`;
    return html;
  }

  // ---------- Header ----------
  function renderHeader() {
    const s = state.settings;
    const g = [];
    if (s.ieltsTarget) g.push('IELTS ' + esc(s.ieltsTarget));
    if (s.toeicTarget) g.push('TOEIC ' + esc(s.toeicTarget));
    $('#goals').innerHTML = g.length ? 'Mục tiêu: ' + g.join(' · ') : 'IELTS + TOEIC';
    const cd = $('#countdown');
    if (s.examDate) {
      const diff = Math.round((parseYmd(s.examDate) - parseYmd(ymd(now()))) / 86400000);
      cd.hidden = false;
      cd.innerHTML = diff > 0 ? `còn <b>${diff}</b> ngày` : diff === 0 ? '<b>Hôm nay</b> thi' : `đã thi <b>${-diff}</b> ngày`;
      cd.title = 'Ngày thi ' + dmy(s.examDate);
    } else cd.hidden = true;
  }

  // ---------- Trang Hôm nay ----------
  function renderToday() {
    const n = now(); const date = ymd(n); const m = minsOfDay(n);
    const slots = slotsOf(n);
    const cur = slots.find(s => m >= s.startMin && m < s.endMin);
    const next = slots.find(s => s.startMin > m && s.type === 'study');
    let hero = '';

    if (cur && cur.type === 'study') {
      const studyLeft = cur.startMin + STUDY_MIN - m;
      const timeTxt = studyLeft > 0
        ? `Còn <b>${studyLeft}</b> phút học, sau đó nghỉ 10 phút`
        : `Đang nghỉ giải lao, còn <b>${cur.endMin - m}</b> phút tới khung sau`;
      hero = `<div class="card now-card" data-start="${cur.start}">
        <div class="now-label">Đang học · ${slotLabel(cur)}</div>
        <div class="now-skill"><span class="chip ${skillClass(cur.skill)}" style="font-size:1.3rem;padding:2px 14px">${esc(cur.skill)}</span> <span class="now-app">${esc(cur.app)}</span></div>
        <p class="now-desc">${esc(cur.desc)}</p>
        <div class="now-time">${timeTxt}</div>
        <div class="actions">${slotButtons(date, cur)}</div>
      </div>`;
    } else {
      let title, sub = '';
      if (cur) { title = cur.skill + (cur.note ? ' · ' + cur.note : ''); sub = cur.desc; }
      else if (m < slots[0].startMin) title = 'Chưa tới giờ học';
      else title = 'Hết giờ học hôm nay';
      let nextHtml = '';
      if (next) {
        nextHtml = `<div class="now-time">Khung tiếp theo lúc <b>${next.start}</b> (còn ${next.startMin - m} phút): <span class="chip ${skillClass(next.skill)}">${esc(next.skill)}</span> ${esc(next.app)}</div>
          <div class="actions">${slotButtons(date, next)}</div>`;
      } else if (!cur || m >= slots[slots.length - 1].endMin) {
        nextHtml = '<div class="now-time">Nghỉ ngơi và ngủ đúng giờ nhé.</div>';
      }
      hero = `<div class="card now-card" ${next ? `data-start="${next.start}"` : ''}>
        <div class="now-label">${S.days[dayIdx(n)]}, ${dm(n)} · ${pad(n.getHours())}:${pad(n.getMinutes())}</div>
        <div class="now-skill">${esc(title)}</div>
        ${sub ? `<p class="now-desc muted">${esc(sub)}</p>` : ''}
        ${nextHtml}
      </div>`;
    }

    const studyCount = slots.filter(s => s.type === 'study').length;
    const doneCount = slots.filter(s => findLog(date, s.start)).length;
    const items = slots.map(s => {
      const st = slotStatus(date, s);
      const isCur = cur === s;
      if (s.type !== 'study') {
        return `<li class="slot off ${isCur ? 'current' : ''}">
          <div class="slot-time">${s.start}<small>${s.end}</small></div>
          <div><div class="slot-head"><span class="chip sk">${esc(s.skill)}</span>${s.note ? `<span class="muted small">${esc(s.note)}</span>` : ''}</div>
          <p class="slot-desc">${esc(s.desc)}</p></div></li>`;
      }
      const log = findLog(date, s.start);
      const badge = st === 'done' ? '<span class="status ok">✓ Đã học</span>'
        : st === 'missed' ? '<span class="status miss">Bỏ lỡ</span>'
        : st === 'now' ? '<span class="status now">● Đang học</span>' : '';
      return `<li class="slot ${isCur ? 'current' : ''}" data-start="${s.start}">
        <div class="slot-time">${s.start}<small>${s.end}</small></div>
        <div>
          <div class="slot-head"><span class="chip ${skillClass(s.skill)}">${esc(s.skill)}</span><span class="slot-app">${esc(s.app)}</span>${badge}</div>
          <p class="slot-desc">${esc(s.desc)}</p>
          ${log ? `<div class="logged-info">${log.minutes} phút${log.result ? ' · ' + esc(log.result) : ''}${log.note ? ' · ' + esc(log.note) : ''}</div>` : ''}
          <div class="actions">${slotButtons(date, s)}</div>
        </div></li>`;
    }).join('');

    $('#page-today').innerHTML = hero + `<div class="card">
      <div class="toolbar"><h2 class="title" style="margin:0">${S.days[dayIdx(n)]}, ${dm(n)}</h2><span class="muted small">Đã ghi ${doneCount}/${studyCount} khung</span></div>
      <ul class="slot-list">${items}</ul></div>`;
  }

  // ---------- Trang Tuần ----------
  let weekOffset = 0;
  function renderWeek() {
    const mon = addDays(mondayOf(now()), weekOffset * 7);
    const sun = addDays(mon, 6);
    const today = ymd(now()); const m = minsOfDay(now());
    const starts = S.slots[0].map(s => s.start);
    let head = '<tr><th class="timecol"></th>';
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i);
      head += `<th class="${ymd(d) === today ? 'today' : ''}">${S.days[i]}<br><span class="muted">${dm(d)}</span></th>`;
    }
    head += '</tr>';
    let body = '';
    starts.forEach((st, r) => {
      body += `<tr><td class="time">${st}</td>`;
      for (let i = 0; i < 7; i++) {
        const d = addDays(mon, i); const date = ymd(d);
        const s = S.slots[i][r];
        const isNow = date === today && m >= s.startMin && m < s.endMin;
        if (s.type !== 'study') {
          body += `<td><div class="cell sk ${isNow ? 'now' : ''}"><span class="c-skill">${esc(s.skill)}</span>${s.note ? `<span class="c-app">${esc(s.note)}</span>` : ''}</div></td>`;
          continue;
        }
        const stt = slotStatus(date, s);
        const mark = stt === 'done' ? '<span class="mark">✓</span>' : stt === 'missed' ? '<span class="mark">bỏ lỡ</span>' : '';
        body += `<td><button class="cell ${skillClass(s.skill)} ${stt === 'done' ? 'logged' : ''} ${stt === 'missed' ? 'missed' : ''} ${isNow ? 'now' : ''}"
          data-act="log" data-date="${date}" data-start="${s.start}" title="${esc(s.skill + ' · ' + s.app + ' — ' + s.desc)}">
          <span class="c-skill">${esc(s.skill)}</span><span class="c-app">${esc(s.app)}</span>${mark}</button></td>`;
      }
      body += '</tr>';
    });
    const legend = SKILLS.map(k => `<span class="chip ${skillClass(k)}">${k}</span>`).join('') + '<span class="chip sk">Nghỉ / Dạy thêm</span>';
    $('#page-week').innerHTML = `
      <div class="toolbar">
        <button class="btn sm" data-week="-1" aria-label="Tuần trước">‹ Tuần trước</button>
        <div class="title" style="text-align:center">${dm(mon)} – ${dm(sun)}/${sun.getFullYear()}</div>
        <button class="btn sm" data-week="1" aria-label="Tuần sau">Tuần sau ›</button>
      </div>
      ${weekOffset !== 0 ? '<div class="toolbar"><button class="btn sm ghost" data-week="0">Về tuần này</button></div>' : ''}
      <div class="grid-wrap"><table class="week"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <div class="legend">${legend}</div>
      <p class="muted small">Bấm vào một ô học để ghi. ✓ là đã ghi, “bỏ lỡ” là khung đã qua mà chưa ghi.</p>`;
  }

  // ---------- Trang Tiến độ ----------
  let progOffset = 0;
  function weekRange(mon) { return [ymd(mon), ymd(addDays(mon, 6))]; }
  function minutesBetween(a, b) {
    return state.logs.filter(l => l.date >= a && l.date <= b).reduce((t, l) => t + (Number(l.minutes) || 0), 0);
  }
  function streak() {
    const days = new Set(state.logs.map(l => l.date));
    let d = new Date(now()); d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (!days.has(ymd(d))) d = addDays(d, -1); // hôm nay chưa ghi thì tính từ hôm qua
    let c = 0;
    while (days.has(ymd(d))) { c++; d = addDays(d, -1); }
    return c;
  }
  function renderProgress() {
    const mon = addDays(mondayOf(now()), progOffset * 7);
    const [a, b] = weekRange(mon);
    const logs = state.logs.filter(l => l.date >= a && l.date <= b);
    const planned = {}; const actual = {};
    SKILLS.forEach(k => { planned[k] = 0; actual[k] = 0; });
    let plannedSlots = 0;
    S.slots.forEach(day => day.forEach(s => { if (s.type === 'study') { planned[s.skill] += STUDY_MIN; plannedSlots++; } }));
    logs.forEach(l => { if (actual[l.skill] == null) actual[l.skill] = 0; actual[l.skill] += Number(l.minutes) || 0; });
    const loggedSlots = new Set(logs.map(l => l.date + l.start)).size;
    const pct = Math.round(loggedSlots / plannedSlots * 100);
    const totalPlanned = plannedSlots * STUDY_MIN;
    const weekMin = logs.reduce((t, l) => t + (Number(l.minutes) || 0), 0);
    const allMin = state.logs.reduce((t, l) => t + (Number(l.minutes) || 0), 0);

    const rows = SKILLS.map(k => {
      const p = planned[k], v = actual[k];
      const w = p ? Math.min(100, v / p * 100) : 0;
      return `<div class="skill-row"><span class="chip ${skillClass(k)}">${k}</span>
        <div class="bar" role="img" aria-label="${k}: ${v} trên ${p} phút"><span style="width:${w}%;background:${SKILL_COLOR[k]}"></span></div>
        <span class="num">${v}/${p} phút</span></div>`;
    }).join('');

    // 8 tuần gần nhất (tính đến tuần hiện tại)
    const thisMon = mondayOf(now());
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const wm = addDays(thisMon, -7 * i); const [wa, wb] = weekRange(wm);
      weeks.push({ label: dm(wm), hours: minutesBetween(wa, wb) / 60, cur: i === 0 });
    }
    const W = 640, H = 220, padL = 34, padB = 28, padT = 20;
    const maxH = Math.max(...weeks.map(w => w.hours));
    const step = [1, 2, 5, 10, 15, 20, 25].find(v => v * 4 >= maxH) || Math.ceil(maxH / 40) * 10;
    const ymax = step * 4;
    const bw = (W - padL - 10) / weeks.length;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Số giờ học 8 tuần gần nhất">`;
    for (let t = 0; t <= 4; t++) {
      const v = ymax * t / 4; const y = H - padB - (H - padB - padT) * t / 4;
      svg += `<line x1="${padL}" x2="${W - 10}" y1="${y}" y2="${y}"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end">${v}</text>`;
    }
    weeks.forEach((w, i) => {
      const h = (H - padB - padT) * (w.hours / ymax);
      const x = padL + i * bw + bw * 0.18; const bwi = bw * 0.64; const y = H - padB - h;
      svg += `<rect class="bar-rect ${w.cur ? 'cur' : ''}" x="${x}" y="${y}" width="${bwi}" height="${Math.max(h, 0)}" rx="4"><title>Tuần ${w.label}: ${fmtHours(w.hours * 60)} giờ</title></rect>`;
      if (w.hours > 0) svg += `<text class="val" x="${x + bwi / 2}" y="${y - 5}" text-anchor="middle">${fmtHours(w.hours * 60)}</text>`;
      svg += `<text x="${x + bwi / 2}" y="${H - 9}" text-anchor="middle">${w.label}</text>`;
    });
    svg += '</svg>';

    $('#page-progress').innerHTML = `
      <div class="toolbar">
        <button class="btn sm" data-prog="-1">‹ Tuần trước</button>
        <div class="title" style="text-align:center">Tuần ${dm(mon)} – ${dm(addDays(mon, 6))}</div>
        <button class="btn sm" data-prog="1">Tuần sau ›</button>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="k-label">Hoàn thành tuần</div><div class="k-val">${pct}%</div><div class="k-sub">${loggedSlots}/${plannedSlots} khung · ${weekMin}/${totalPlanned} phút</div></div>
        <div class="kpi"><div class="k-label">Ngày học liên tiếp</div><div class="k-val">${streak()}</div><div class="k-sub">ngày</div></div>
        <div class="kpi"><div class="k-label">Tổng số giờ</div><div class="k-val">${fmtHours(allMin)}</div><div class="k-sub">${state.logs.length} buổi đã ghi</div></div>
      </div>
      <div class="card"><h2>Thực tế so với kế hoạch theo kỹ năng</h2>
        <p class="muted small" style="margin:0 0 8px">Kế hoạch = số khung × ${STUDY_MIN} phút.</p>${rows}</div>
      <div class="card chart"><h2>Số giờ học 8 tuần gần nhất</h2>${svg}
        <p class="muted small" style="margin:6px 0 0">Cột nhạt là tuần hiện tại. Kế hoạch mỗi tuần: ${fmtHours(totalPlanned)} giờ.</p></div>`;
  }

  // ---------- Trang Sổ từ vựng ----------
  let vocabQuery = '';
  let vocabFilter = 'all';
  let vocabSort = 'new';
  const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

  function vocabList() {
    const q = fold(vocabQuery.trim());
    let list = state.vocab.filter(v => {
      if (vocabFilter === 'learning' && v.learned) return false;
      if (vocabFilter === 'learned' && !v.learned) return false;
      if (!q) return true;
      return fold([v.word, v.meaning, v.usage, v.example, v.ipa, v.source].join(' ')).includes(q);
    });
    if (vocabSort === 'az') list.sort((x, y) => x.word.localeCompare(y.word, 'en', { sensitivity: 'base' }));
    else list.sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
    return list;
  }

  function vocabCard(v) {
    const multi = t => esc(t).replace(/\n/g, '<br>');
    return `<article class="vcard ${v.learned ? 'learned' : ''}">
      <div class="v-head">
        <span class="v-word">${esc(v.word)}</span>
        ${v.ipa ? `<span class="v-ipa">${esc(v.ipa)}</span>` : ''}
        ${v.pos ? `<span class="chip sk-vocab">${esc(v.pos)}</span>` : ''}
        ${v.learned ? '<span class="chip sk-listen">✓ Đã thuộc</span>' : ''}
      </div>
      <div class="v-meaning">${multi(v.meaning)}</div>
      ${v.usage ? `<div class="v-block"><div class="v-label">Cách dùng</div><div>${multi(v.usage)}</div></div>` : ''}
      ${v.example ? `<div class="v-block"><div class="v-label">Ví dụ</div><div class="v-ex">${multi(v.example)}</div></div>` : ''}
      <div class="v-foot">
        <span class="muted small">${v.createdAt ? dmy(v.createdAt.slice(0, 10)) : ''}${v.source ? ' · ' + esc(v.source) : ''}</span>
        <span class="spacer"></span>
        <button class="btn sm ghost" data-act="vlearn" data-id="${esc(v.id)}">${v.learned ? 'Học lại' : 'Đã thuộc'}</button>
        <button class="btn sm" data-act="vedit" data-id="${esc(v.id)}">Sửa</button>
      </div>
    </article>`;
  }

  function renderVocabList() {
    const list = vocabList();
    const box = $('#vocabList'); if (!box) return;
    box.innerHTML = list.length ? list.map(vocabCard).join('')
      : `<div class="empty card">${state.vocab.length ? 'Không có từ nào khớp.' : 'Chưa có từ nào. Bấm “+ Thêm từ” để lưu từ mới học được cùng cách dùng.'}</div>`;
  }

  function renderVocab() {
    const total = state.vocab.length;
    const learned = state.vocab.filter(v => v.learned).length;
    const [a, b] = weekRange(mondayOf(now()));
    const thisWeek = state.vocab.filter(v => v.createdAt && v.createdAt.slice(0, 10) >= a && v.createdAt.slice(0, 10) <= b).length;
    $('#page-vocab').innerHTML = `
      <div class="toolbar">
        <h2 class="title" style="margin:0">Sổ từ vựng</h2>
        <button class="btn primary" data-act="vadd">+ Thêm từ</button>
      </div>
      <div class="kpis kpis-3">
        <div class="kpi"><div class="k-label">Tổng số từ</div><div class="k-val">${total}</div></div>
        <div class="kpi"><div class="k-label">Đã thuộc</div><div class="k-val">${learned}</div></div>
        <div class="kpi"><div class="k-label">Thêm tuần này</div><div class="k-val">${thisWeek}</div></div>
      </div>
      <div class="toolbar">
        <input id="vSearch" type="search" placeholder="Tìm từ, nghĩa, cách dùng…" value="${esc(vocabQuery)}" style="flex:1;min-width:180px">
        <select id="vFilter" aria-label="Lọc">
          <option value="all">Tất cả</option><option value="learning">Đang học</option><option value="learned">Đã thuộc</option>
        </select>
        <select id="vSort" aria-label="Sắp xếp">
          <option value="new">Mới nhất</option><option value="az">A → Z</option>
        </select>
      </div>
      <div id="vocabList" class="vocab-grid"></div>`;
    $('#vFilter').value = vocabFilter;
    $('#vSort').value = vocabSort;
    renderVocabList();
  }

  // Hộp thoại thêm / sửa từ
  let editingWord = null;
  function openVocab(id) {
    const v = id ? state.vocab.find(x => x.id === id) : null;
    editingWord = v;
    const f = $('#vocabForm');
    $('#vocabTitle').textContent = v ? 'Sửa từ' : 'Thêm từ mới';
    f.word.value = v ? v.word : '';
    f.ipa.value = v ? (v.ipa || '') : '';
    f.pos.value = v ? (v.pos || '') : '';
    f.meaning.value = v ? v.meaning : '';
    f.usage.value = v ? (v.usage || '') : '';
    f.example.value = v ? (v.example || '') : '';
    f.source.value = v ? (v.source || '') : '';
    f.learned.checked = v ? !!v.learned : false;
    $('#vocabDelete').hidden = !v;
    const dlg = $('#vocabDialog');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    f.word.focus();
  }
  function closeVocab() { const dlg = $('#vocabDialog'); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); editingWord = null; }

  $('#vocabForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const word = f.word.value.trim(); const meaning = f.meaning.value.trim();
    if (!word || !meaning) { toast('Cần nhập từ và nghĩa'); return; }
    if (!editingWord && state.vocab.some(v => v.word.toLowerCase() === word.toLowerCase())
      && !confirm(`“${word}” đã có trong sổ. Vẫn thêm nữa?`)) return;
    const data = {
      word, meaning, ipa: f.ipa.value.trim(), pos: f.pos.value, usage: f.usage.value.trim(),
      example: f.example.value.trim(), source: f.source.value.trim(), learned: f.learned.checked
    };
    if (editingWord) Object.assign(editingWord, data, { updatedAt: new Date().toISOString() });
    else state.vocab.push(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: ymd(now()) + 'T' + now().toTimeString().slice(0, 8) }, data));
    const wasNew = !editingWord;
    save(); closeVocab(); render(); toast(wasNew ? `Đã lưu “${word}”` : 'Đã cập nhật');
  });
  $('#vocabCancel').addEventListener('click', closeVocab);
  $('#vocabDelete').addEventListener('click', () => {
    if (!editingWord || !confirm(`Xóa “${editingWord.word}” khỏi sổ?`)) return;
    const id = editingWord.id;
    state.vocab = state.vocab.filter(v => v.id !== id);
    save(); closeVocab(); render(); toast('Đã xóa');
  });

  // ---------- Trang Cài đặt ----------
  function renderSettings() {
    const s = state.settings;
    $('#page-settings').innerHTML = `
      <form class="card" id="settingsForm">
        <h2>Liên kết</h2>
        <div class="form-grid">
          <label>Link Google Sheet <span class="hint">— file Lịch học có sheet Nhật ký học</span>
            <input name="sheetUrl" type="url" placeholder="https://docs.google.com/spreadsheets/..." value="${esc(s.sheetUrl)}"></label>
        </div>
        <h2 style="margin-top:20px">Mục tiêu</h2>
        <div class="form-grid two">
          <label>Mục tiêu IELTS (band)<input name="ieltsTarget" type="number" min="1" max="9" step="0.5" placeholder="vd 7.0" value="${esc(s.ieltsTarget)}"></label>
          <label>Mục tiêu TOEIC<input name="toeicTarget" type="number" min="10" max="990" step="5" placeholder="vd 850" value="${esc(s.toeicTarget)}"></label>
          <label>Ngày thi<input name="examDate" type="date" value="${esc(s.examDate)}"></label>
        </div>
        <div class="actions"><button class="btn primary" type="submit">Lưu cài đặt</button></div>
      </form>
      <div class="card">
        <h2>Sao lưu dữ liệu</h2>
        <p class="muted small" style="margin-top:0">Dữ liệu chỉ nằm trong trình duyệt này. Xuất file JSON định kỳ để không bị mất, và nhập lại khi đổi máy hoặc trình duyệt.</p>
        <div class="actions">
          <button class="btn" id="exportJson">Xuất file JSON</button>
          <label class="btn" for="importJson" style="font-size:inherit">Nhập file JSON</label>
          <input id="importJson" type="file" accept="application/json,.json" hidden>
        </div>
        <p class="muted small">Đang có ${state.logs.length} buổi đã ghi và ${state.vocab.length} từ trong sổ từ vựng.</p>
      </div>`;
  }

  // ---------- Hộp thoại ghi ----------
  let editing = null;
  function openLog(date, start) {
    const d = parseYmd(date);
    const slot = slotsOf(d).find(s => s.start === start);
    if (!slot || slot.type !== 'study') return;
    const existing = findLog(date, start);
    editing = { date, slot, existing };
    const f = $('#logForm');
    $('#logTitle').textContent = existing ? 'Sửa buổi đã ghi' : 'Ghi đã học';
    $('#logSub').textContent = `${S.days[dayIdx(d)]} ${dmy(date)} · ${slotLabel(slot)} · ${slot.skill} · ${slot.app}`;
    f.content.value = existing ? existing.content : slot.desc;
    f.minutes.value = existing ? existing.minutes : STUDY_MIN;
    f.result.value = existing ? existing.result : '';
    f.note.value = existing ? existing.note : '';
    $('#logDelete').hidden = !existing;
    const dlg = $('#logDialog');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    f.minutes.focus(); f.minutes.select();
  }
  function closeLog() { const dlg = $('#logDialog'); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); editing = null; }

  $('#logForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!editing) return;
    const f = e.target;
    const minutes = parseInt(f.minutes.value, 10);
    if (!(minutes > 0)) { toast('Số phút phải lớn hơn 0'); return; }
    const { date, slot, existing } = editing;
    const entry = {
      id: existing ? existing.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date, start: slot.start, slot: slotLabel(slot), app: slot.app, skill: slot.skill,
      content: f.content.value.trim(), minutes, result: f.result.value.trim(), note: f.note.value.trim(),
      updatedAt: new Date().toISOString()
    };
    state.logs = state.logs.filter(l => !(l.date === date && l.start === slot.start));
    state.logs.push(entry);
    save(); closeLog(); render(); toast('Đã lưu buổi học');
  });
  $('#logCancel').addEventListener('click', closeLog);
  $('#logDelete').addEventListener('click', () => {
    if (!editing || !editing.existing) return;
    if (!confirm('Xóa buổi đã ghi này?')) return;
    state.logs = state.logs.filter(l => l.id !== editing.existing.id);
    save(); closeLog(); render(); toast('Đã xóa');
  });

  // ---------- Sự kiện chung ----------
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-act],[data-week],[data-prog],#exportJson');
    if (!t) return;
    if (t.dataset.act === 'log') { openLog(t.dataset.date, t.dataset.start); return; }
    if (t.dataset.act === 'vadd') { openVocab(null); return; }
    if (t.dataset.act === 'vedit') { openVocab(t.dataset.id); return; }
    if (t.dataset.act === 'vlearn') {
      const v = state.vocab.find(x => x.id === t.dataset.id);
      if (v) { v.learned = !v.learned; save(); renderVocab(); toast(v.learned ? `Đã thuộc “${v.word}”` : `Học lại “${v.word}”`); }
      return;
    }
    if (t.dataset.week != null) { const v = Number(t.dataset.week); weekOffset = v === 0 ? 0 : weekOffset + v; renderWeek(); return; }
    if (t.dataset.prog != null) { progOffset += Number(t.dataset.prog); renderProgress(); return; }
    if (t.id === 'exportJson') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'tu-hoc-tieng-anh-' + ymd(now()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Đã xuất file JSON');
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'vSearch') { vocabQuery = e.target.value; renderVocabList(); }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'vFilter') { vocabFilter = e.target.value; renderVocabList(); }
    if (e.target.id === 'vSort') { vocabSort = e.target.value; renderVocabList(); }
    if (e.target.id === 'importJson') {
      const file = e.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d || (!Array.isArray(d.logs) && !Array.isArray(d.vocab))) throw new Error('bad');
          const nd = normalize(d);
          if (!confirm(`File có ${nd.logs.length} buổi và ${nd.vocab.length} từ. Thay toàn bộ dữ liệu hiện tại (${state.logs.length} buổi, ${state.vocab.length} từ) bằng file này?`)) return;
          state = nd;
          save(); render(); toast('Đã nhập dữ liệu');
        } catch (err) { toast('File JSON không hợp lệ'); }
      };
      r.readAsText(file);
      e.target.value = '';
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'settingsForm') return;
    e.preventDefault();
    const f = e.target;
    ['sheetUrl', 'ieltsTarget', 'toeicTarget', 'examDate'].forEach(k => { state.settings[k] = f[k].value.trim(); });
    save(); renderHeader(); toast('Đã lưu cài đặt');
  });

  // ---------- Điều hướng ----------
  const PAGES = { today: renderToday, week: renderWeek, progress: renderProgress, vocab: renderVocab, settings: renderSettings };
  function currentPage() { const h = location.hash.slice(1); return PAGES[h] ? h : 'today'; }
  function render() {
    const p = currentPage();
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.page === p));
    renderHeader();
    PAGES[p]();
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  // Cập nhật mỗi 30 giây (trừ khi đang mở hộp thoại hoặc đang ở Cài đặt)
  setInterval(() => {
    if ($('#logDialog').open || $('#vocabDialog').open) return;
    const p = currentPage();
    if (p === 'today' || p === 'week') render();
    else renderHeader();
  }, 30000);
  render();
})();
