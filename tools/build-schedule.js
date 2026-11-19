// Chuyển file CSV "Thời khóa biểu" thành data/schedule.js
// Chạy: node tools/build-schedule.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const csvFile = fs.readdirSync(ROOT).find(f => f.endsWith('Thời khóa biểu.csv'));
if (!csvFile) throw new Error('Không thấy file CSV Thời khóa biểu');
const text = fs.readFileSync(path.join(ROOT, csvFile), 'utf8').replace(/^\uFEFF/, '');

function parseCSV(s) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const rows = parseCSV(text);
const headerIdx = rows.findIndex(r => r[0] === 'Khung giờ');
const slotRows = [];
for (let i = headerIdx + 1; i < rows.length; i++) {
  if (!/^\d\d:\d\d - \d\d:\d\d$/.test((rows[i][0] || '').trim())) break;
  slotRows.push(rows[i]);
}

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Ô gộp (11:00 - 13:00 chỉ điền ở Thứ 2) => dùng lại ô trước đó trong cùng dòng
function cellsOf(r) {
  const out = []; let last = '';
  for (let d = 1; d <= 7; d++) { const v = (r[d] || '').trim(); if (v) last = v; out.push(v || last); }
  return out;
}

// Gắn link trang con của từng app
function linkFor(app, skill, desc, label) {
  const d = (desc + ' ' + label).toLowerCase();
  switch (app) {
    case 'AIO English':
      if (d.includes('gõ câu')) return 'https://aioenglish.com/go-cau';
      if (d.includes('đọc & dịch') || d.includes('dịch')) return 'https://aioenglish.com/luyen-dich-thuat';
      if (d.includes('video')) return 'https://aioenglish.com/video';
      if (skill === 'Ngữ pháp') return 'https://aioenglish.com/ngu-phap';
      if (skill === 'Từ vựng') return 'https://aioenglish.com/tu-vung';
      return 'https://aioenglish.com/lo-trinh';
    case 'Venglish':
      if (skill === 'Thi thử' || d.includes('thi thật') || d.includes('đáp án listening')) return 'https://venglish.org/luyen-tap/ielts/thi-that/';
      if (d.includes('dictation') || d.includes('shadowing')) return 'https://venglish.org/chep-chinh-ta/?bo=ielts-intermediate';
      if (d.includes('thử thách')) return 'https://venglish.org/thu-thach';
      if (skill === 'Từ vựng') return 'https://venglish.org/tu-vung/';
      return 'https://venglish.org/ielts/';
    case 'Pencil Test':
      if (skill === 'Thi thử') return 'https://penciltest.ai/exam/listening-reading';
      if (d.includes('toeic speaking') || d.includes('toeic writing')) return 'https://penciltest.ai/exam/speaking-writing';
      if (d.includes('nghe & nói')) return 'https://penciltest.ai/practice/listen-speak';
      if (skill === 'Ôn lỗi' || d.includes('sổ lỗi sai')) return 'https://penciltest.ai/practice/mistake-book';
      if (skill === 'Ngữ pháp' || skill === 'Từ vựng') return 'https://penciltest.ai/practice/grammar';
      if (d.includes('part')) return 'https://penciltest.ai/practice/part';
      return 'https://penciltest.ai/onboarding';
    case 'OpenTOEIC':
      if (skill === 'Nghe') return 'https://opentoeic.com/listening';
      if (skill === 'Đọc') return 'https://opentoeic.com/reading';
      if (skill === 'Ngữ pháp') return 'https://opentoeic.com/ngu-phap';
      return 'https://opentoeic.com/vocabulary';
    case 'ForumFlashStudy':
      if (skill === 'Viết') return 'https://www.forumflashstudy.com/cong-cu/cham-writing-task-2';
      return 'https://www.forumflashstudy.com/';
    case 'Bảng tính này':
      return '@sheet'; // dùng link Google Sheet trong Cài đặt
  }
  return '';
}

const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const days = DAYS.map(() => []);

for (const r of slotRows) {
  const [a, b] = r[0].split(' - ');
  const cells = cellsOf(r);
  cells.forEach((cell, di) => {
    const lines = cell.split('\n').map(x => x.trim()).filter(Boolean);
    const head = lines[0] || '';
    const desc = lines.slice(1).join(' ');
    const parts = head.split('|').map(x => x.trim());
    const slot = { start: a, end: b, startMin: toMin(a), endMin: toMin(b) };
    if (parts[0] === 'Nghỉ ngơi' || parts[0] === 'Dạy thêm') {
      slot.type = parts[0] === 'Nghỉ ngơi' ? 'rest' : 'teach';
      slot.skill = parts[0];
      slot.note = parts[1] || '';
      slot.desc = desc;
    } else {
      slot.type = 'study';
      slot.skill = parts[0];
      slot.app = parts[1] || '';
      slot.desc = desc;
    }
    days[di].push(slot);
  });
}

// Sửa lỗi đảo ô: 20:00 Thứ 4 <-> Thứ 6
const i20 = days[2].findIndex(s => s.start === '20:00');
const tmp = days[2][i20]; days[2][i20] = days[4][i20]; days[4][i20] = tmp;
days[2][i20] = { ...days[2][i20], type: 'teach', skill: 'Dạy thêm', note: '19:00 - 21:00', desc: 'Giờ dạy 19:00 - 21:00, không xếp bài học.' };

for (const day of days) for (const s of day) {
  if (s.type !== 'study') continue;
  s.link = linkFor(s.app, s.skill, s.desc, '');
  const d = s.desc.toLowerCase();
  s.claude = s.skill === 'Nói' || s.skill === 'Viết' ||
    (s.skill === 'Thi thử' && (/phần writing|phần speaking/.test(d)));
}

const out = '// Tự sinh từ CSV bằng tools/build-schedule.js. Chỉ số ngày: 0 = Thứ 2 ... 6 = Chủ nhật.\n' +
  'window.SCHEDULE = ' + JSON.stringify({ days: DAYS, slots: days }, null, 1) + ';\n';
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'schedule.js'), out);

for (let di = 0; di < 7; di++) {
  console.log('== ' + DAYS[di]);
  for (const s of days[di]) console.log(`${s.start} ${s.type.padEnd(5)} ${s.skill.padEnd(9)} ${(s.app || '').padEnd(15)} ${s.claude ? 'CLAUDE ' : ''}${s.link || ''}`);
}
