/* スキルツリーのルール（アプリと MCP サーバーで共有する）
   - データは1つの JSON。状態を変える関数は、元を変えずに新しい状態を返す */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkillCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ================= きまり =================
  const SLOTS = ['1', '2a', '2b', '3a', '3b', '4'];
  const LEVEL = { '1': 1, '2a': 2, '2b': 2, '3a': 3, '3b': 3, '4': 4 };
  const PARENTS = { '1': [], '2a': ['1'], '2b': ['1'], '3a': ['2a'], '3b': ['2b'], '4': ['3a', '3b'] };
  const FREQ = { d: '毎日', w1: '週1回', w2: '週2回', w3: '週3回', m1: '月1回', g: '達成目標' };
  const RATE = { d: 1, w1: 1 / 7, w2: 2 / 7, w3: 3 / 7, m1: 1 / 30 };
  const SPAN = [30, 80, 110, 145]; // 1段ごとの目安日数（合計365日で最終スキル）
  const MAX_BRANCHES = 6;
  // 8割できれば1年で最終スキルに届く回数
  const yearNeed = (lv, f) => (f === 'g' ? 1 : Math.max(1, Math.round(SPAN[lv - 1] * RATE[f] * 0.8)));

  // ================= 日付 =================
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const todayKey = () => keyOf(new Date());
  const monOf = k => addDays(k, -((parseKey(k).getDay() + 6) % 7));
  const isDate = k => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k);
  const clone = o => JSON.parse(JSON.stringify(o));
  const stamp = st => { st.updatedAt = new Date().toISOString(); return st; };

  // ================= テンプレート =================
  // [アイコン, 名前, 説明, 確認すること, 頻度, 追加]
  const TEMPLATE = [
    { key: 'judge', name: '判断力', en: 'JUDGMENT', color: '#86ace0', nodes: [
      ['eye', '状況把握', '判断の前に事実を集め、思い込みと事実を分けて見る。', '今日の決定を1つ選び、根拠にした事実を3つ書き出す', 'd'],
      ['filter', '優先順位づけ', '重要度と緊急度で、やることをふるいにかける。', 'やることを3つに絞り、やらないことを1つ決める', 'd'],
      ['git-fork', '選択肢の比較', '最低2つの案を並べ、得るものと失うものを比べる。', '迷っていることにA案・B案を作り、それぞれの代償を書く', 'w2'],
      ['crosshair', '即断即決', '情報が7割そろったら決め、決めた後で修正する。', '5分で決められる案件を、実際に5分で決める', 'd'],
      ['compass', '判断軸', '自分が何を大事にして決めるのかを言葉にする。', '今週の判断で使った基準を一文にする', 'w1'],
      ['gavel', '決断の責任', '結果を引き受け、振り返りで次の判断を磨く。', '今週の決定を1つ振り返り、次に変える点を書く', 'w1']] },
    { key: 'nego', name: '折衝力', en: 'NEGOTIATION', color: '#e0a46a', nodes: [
      ['ear', '傾聴', '相手の話を最後まで聞き、言葉の裏の意図をつかむ。', '会話で相手の言ったことを要約して返す', 'd'],
      ['messages-square', '質問で引き出す', '開いた質問で、相手の本当の関心を引き出す。', '「なぜそう思いますか？」を1回使う', 'w3'],
      ['users', '利害の整理', '双方の立場ではなく、その奥の利害を書き分ける。', '関係者2人の「本当に欲しいもの」を書き出す', 'w1'],
      ['scale', '落としどころ', '譲れる点と譲れない点を先に決めておく。', '交渉や相談の前に、譲れない条件を1つ決める', 'w1'],
      ['megaphone', '主張する', '角を立てずに、自分の要望をはっきり伝える。', '遠慮していた要望を1つ、理由を添えて伝える', 'w2'],
      ['handshake', '合意形成', '全員が納得できる形に話をまとめ、次の行動を決める。', '話し合いの最後に「誰が・いつまでに・何を」を確認する', 'w1']] },
    { key: 'calm', name: '反応しない力', en: 'NON-REACTION', color: '#86c9bc', nodes: [
      ['scan-eye', '心に気づく', '今、自分の心がどう反応しているかに気づく。反応を止める第一歩。', 'イラッとしたら「今、イライラしている」と心の中で言葉にする', 'd'],
      ['wind', '体の感覚を見る', '呼吸や足裏の感覚に意識を向け、頭の中の考えから離れる。', '1分間だけ呼吸の出入りを感じる', 'd'],
      ['circle-pause', '判断しない', '良い・悪いの判断をいったん脇に置き、そのまま見る。', '人や出来事を評価しかけたら「判断している」と気づいて保留する', 'd'],
      ['cloud-fog', '妄想に気づく', '頭で作り上げた想像と、目の前の事実を分ける。', '不安なことを「事実」と「想像」に分けて書き出す', 'w2'],
      ['equal-not', '比べない', '他人と比べて落ち込んだり優越したりする反応を手放す。', '人と比べたと気づいたら、昨日の自分と比べ直す', 'd'],
      ['heart', '慈しみの心', '相手の幸せを願う心を持ち、怒りに巻き込まれない。', '苦手な人に対して、心の中で「幸せでありますように」と念じる', 'w3']] },
    { key: 'reason', name: '意味付け力', en: 'MEANING', color: '#c7a2e0', nodes: [
      ['lightbulb', 'やる理由を見つける', '今日やることに、自分にとっての理由を1つ見つける。', '今日の作業を1つ選び「これをやると自分は何を得るか」を書く', 'd'],
      ['link', '目標とつなぐ', '目の前の作業を、将来なりたい姿とつなげて見る。', '今日の作業が、将来の目標のどこにつながるかを一文にする', 'd'],
      ['sprout', '成長に目を向ける', '結果だけでなく、昨日の自分より伸びた点を見る。', '「前よりできるようになったこと」を1つ書く', 'd'],
      ['key', '言い換える', '面倒な作業も、見方を変えて自分の糧に言い換える。', '気が進まない作業を1つ「〜の練習になる」と言い換える', 'w2'],
      ['gift', '誰かの役に立つ', '自分の行動が誰の助けになるかを思い浮かべる。', '今日の行動で助かる人を1人思い浮かべる', 'd'],
      ['flag', '自分の軸', '何のために頑張るのかを、自分の言葉で持っている。', '「自分が頑張る理由」を見直し、一文で書き直す', 'w1']] },
    { key: 'kin', name: '筋トレ', en: 'STRENGTH', color: '#e0867a', nodes: [
      ['dumbbell', 'ジムに行く', 'ジムに足を運ぶこと自体を、毎回の勝ちにする。', '予定どおりジムに行く', 'w3'],
      ['clipboard-list', 'メニューを決める', '部位ごとの分け方を決め、迷わず今日のメニューに入る。', 'ジムに入る前に、今日の部位と種目を決めておく', 'w3'],
      ['notebook-pen', '記録する', '種目・重量・回数を残し、成長を目に見える形にする。', '今日の種目・重量・回数を記録する', 'w3'],
      ['trending-up', '少しずつ負荷を上げる', '前回より少しだけきつくして、体を成長させ続ける。', '前回より重量か回数を1つだけ上げる', 'w2'],
      ['utensils', '食事と回復', '体はトレーニングだけでなく、食事と睡眠でつくられる。', '毎食たんぱく質のおかずを1品入れ、早めに寝る', 'd'],
      ['biceps-flexed', 'ベンチプレス100kg', '積み重ねの先にある、はっきりした数字の目標。', 'ベンチプレスで100kgを挙げる', 'g', { goalTarget: 100, goalUnit: 'kg', goalDir: 'up' }]] },
    { key: 'grit', name: 'やり抜く力', en: 'GRIT', color: '#dcc566', nodes: [
      ['footprints', '小さく始める', '大きな目標も、5分でできる一歩から始める。', '後回しにしていることに5分だけ手をつける', 'd'],
      ['calendar-check', '習慣化', '同じ時間・同じ場所で続け、意志に頼らない。', '決めた時間に、決めた習慣を1つ実行する', 'd'],
      ['target', '目標の分解', 'ゴールを今週・今日の行動にまで分ける。', '今週の目標を、今日できる行動に分解する', 'w1'],
      ['flame', '情熱の維持', 'なぜやるのかを思い出し、熱を保つ。', '取り組んでいることの「目的」を読み返す', 'w2'],
      ['shield', '逆境耐性', '失敗を学びに変えて、立ち直る。', 'うまくいかなかったことから学びを1つ書く', 'w2'],
      ['mountain', '完遂', '最後までやり切り、完了を自分で確かめる。', '途中で止まっていることを1つ終わらせる', 'w1']] }
  ];
  const PALETTE = ['#86ace0', '#e0a46a', '#86c9bc', '#c7a2e0', '#e0867a', '#dcc566'];

  function templateBranches() {
    return TEMPLATE.map(b => cleanBranch({ key: b.key, name: b.name, en: b.en, color: b.color,
      nodes: Object.fromEntries(SLOTS.map((s, i) => { const [icon, name, desc, act, freq, extra] = b.nodes[i];
        return [s, { icon, name, desc, act, freq, need: yearNeed(LEVEL[s], freq), ...(extra || {}) }]; })) }));
  }
  function emptyState(title) {
    return { v: 4, title: title || 'ビジネス力スキルツリー', branches: [], checks: {}, unlocked: {}, off: {}, records: {}, updatedAt: '' };
  }
  function fresh() { const s = emptyState(); s.branches = templateBranches(); return s; }
  function blank(title) { return emptyState(title || 'わたしのスキルツリー'); }
  const newKey = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function cleanNode(n, s) {
    n = n || {};
    const freq = FREQ[n.freq] ? n.freq : 'd';
    const gt = n.goalTarget === '' || n.goalTarget == null || !Number.isFinite(+n.goalTarget) ? null : +n.goalTarget;
    return {
      icon: String(n.icon || 'star').trim().toLowerCase().slice(0, 40),
      name: String(n.name || `スキル${SLOTS.indexOf(s) + 1}`).slice(0, 30),
      desc: String(n.desc || '').slice(0, 200),
      act: String(n.act || '').slice(0, 120),
      freq,
      need: freq === 'g' ? 1 : Math.max(1, Math.min(999, parseInt(n.need, 10) || yearNeed(LEVEL[s], freq))),
      goalTarget: gt, goalUnit: String(n.goalUnit || '').slice(0, 10), goalDir: n.goalDir === 'down' ? 'down' : 'up'
    };
  }
  function cleanBranch(b, i) {
    b = b || {};
    const key = String(b.key || '').replace(/[^\w-]/g, '').slice(0, 24) || newKey();
    const nodes = {};
    SLOTS.forEach(s => { nodes[s] = cleanNode(b.nodes && b.nodes[s], s); });
    return { key, name: String(b.name || '新しい系統').slice(0, 20), en: String(b.en || '').slice(0, 20),
      color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : PALETTE[(i || 0) % PALETTE.length], nodes };
  }

  function normalize(d) {
    if (!d || typeof d !== 'object') return fresh();
    const s = emptyState();
    if (typeof d.title === 'string' && d.title.trim()) s.title = d.title.slice(0, 40);
    if (Array.isArray(d.branches)) {
      const seen = new Set();
      s.branches = d.branches.slice(0, MAX_BRANCHES).map(cleanBranch).filter(b => !seen.has(b.key) && seen.add(b.key));
    } else s.branches = templateBranches(); // 系統を持たない古いデータ
    const ids = new Set(s.branches.flatMap(b => SLOTS.map(x => b.key + x)));
    if (d.checks && typeof d.checks === 'object') for (const id in d.checks) {
      if (!ids.has(id)) continue; const m = {};
      for (const k in d.checks[id]) { const v = d.checks[id][k]; if ((isDate(k) || k === 'G' || /^M:\d{4}-\d\d$/.test(k)) && isDate(v)) m[k] = v; }
      if (Object.keys(m).length) s.checks[id] = m;
    }
    if (d.unlocked) {
      if (Array.isArray(d.unlocked)) d.unlocked.forEach(id => { if (ids.has(id)) s.unlocked[id] = todayKey(); });
      else for (const id in d.unlocked) if (ids.has(id) && isDate(d.unlocked[id])) s.unlocked[id] = d.unlocked[id];
    }
    if (d.off && typeof d.off === 'object') for (const k in d.off) if (d.off[k] && isDate(k)) s.off[k] = true;
    if (d.records && typeof d.records === 'object') for (const id in d.records) {
      const r = d.records[id]; if (ids.has(id) && r && Number.isFinite(+r.value) && isDate(r.date)) s.records[id] = { value: +r.value, date: r.date };
    }
    if (d.done && typeof d.done === 'object') for (const k in d.done) { // 古い形式
      if (!isDate(k) || !Array.isArray(d.done[k])) continue;
      d.done[k].forEach(id => { if (ids.has(id)) (s.checks[id] = s.checks[id] || {})[k] = k; });
    }
    const k4 = s.branches.find(b => b.key === 'kin')?.nodes['4'];
    if (k4 && k4.name === '自己ベスト' && k4.freq === 'm1' && !s.unlocked.kin4 && !s.checks.kin4)
      Object.assign(k4, cleanNode(TEMPLATE[4].nodes[5] && { icon: 'biceps-flexed', name: 'ベンチプレス100kg', desc: '積み重ねの先にある、はっきりした数字の目標。', act: 'ベンチプレスで100kgを挙げる', freq: 'g', goalTarget: 100, goalUnit: 'kg', goalDir: 'up' }, '4'));
    if (typeof d.updatedAt === 'string') s.updatedAt = d.updatedAt;
    return s;
  }

  // ================= 形と読み取り =================
  const CX = 500, CY = 470, W = 1000, H = 520;
  const pt = (r, deg) => ({ x: CX + r * Math.cos(deg * Math.PI / 180), y: CY - r * Math.sin(deg * Math.PI / 180) });

  function ctx(st) {
    const NODES = { root: { id: 'root', icon: 'sparkles', name: st.title, desc: '', x: CX, y: CY, parents: [], branch: null, color: '#ece8df', level: 0 } };
    const n = st.branches.length;
    st.branches.forEach((b, i) => {
      const ang = n === 1 ? 90 : 170 - i * (160 / (n - 1));
      SLOTS.forEach(s => {
        const d = b.nodes[s], lv = LEVEL[s];
        const r = [0, 140, 245, 340, 430][lv], off = { '1': 0, '2a': 7, '2b': -7, '3a': 8, '3b': -8, '4': 0 }[s];
        NODES[b.key + s] = { id: b.key + s, slot: s, level: lv, ...d, parents: s === '1' ? ['root'] : PARENTS[s].map(p => b.key + p),
          cap: s === '4', branch: b, ang, color: b.color, ...pt(r, ang + off) };
      });
    });
    const ALL = Object.values(NODES), SKILLS = ALL.filter(x => x.id !== 'root');
    const isOn = id => id === 'root' || !!st.unlocked[id];
    const isActive = id => !!NODES[id] && !isOn(id) && NODES[id].parents.every(isOn);
    const count = id => Object.keys(st.checks[id] || {}).length;
    const pctOf = id => Math.min(100, Math.round(count(id) / NODES[id].need * 100));
    const quota = f => (f[0] === 'w' ? +f[1] : 1);
    const weekCount = (id, k) => { const m = monOf(k); let c = 0; for (let i = 0; i < 7; i++) if (st.checks[id]?.[addDays(m, i)]) c++; return c; };
    const keyFor = (nd, k) => (nd.freq === 'g' ? 'G' : nd.freq === 'm1' ? 'M:' + k.slice(0, 7) : k);
    const checkedOn = (nd, k) => !!st.checks[nd.id]?.[keyFor(nd, k)];
    const satisfied = (nd, k) => (nd.freq[0] === 'w' ? (checkedOn(nd, k) || weekCount(nd.id, k) >= quota(nd.freq)) : checkedOn(nd, k));
    const activeNodes = () => SKILLS.filter(x => isActive(x.id));
    // その日に確認するもの＝その日に挑戦中だったスキル（解放した当日も含む）
    const itemsOn = k => SKILLS.filter(x => x.parents.every(p => p === 'root' || (st.unlocked[p] && st.unlocked[p] <= k)) && (!st.unlocked[x.id] || st.unlocked[x.id] >= k));
    const perDay = () => { const m = {}; for (const id in st.checks) for (const key in st.checks[id]) { const v = st.checks[id][key]; m[v] = (m[v] || 0) + 1; } return m; };
    const hasCheckMap = perDay();
    const hasCheck = k => !!hasCheckMap[k];
    const firstKey = () => { let f = todayKey(); for (const k in hasCheckMap) if (k < f) f = k; return f; };
    const runs = () => { const out = []; let len = 0; const t = todayKey();
      for (let k = firstKey(); k <= t; k = addDays(k, 1)) { if (hasCheck(k)) len++; else if (!st.off[k] && k !== t) { if (len) out.push(len); len = 0; } }
      if (len) out.push(len); return out; };
    const streak = () => { let k = todayKey(), c = 0; if (!hasCheck(k)) k = addDays(k, -1);
      for (let i = 0; i < 4000; i++) { if (hasCheck(k)) c++; else if (!st.off[k]) break; k = addDays(k, -1); } return c; };
    const rec = id => st.records[id] || null;
    const goalMet = (nd, v) => nd.goalTarget != null && (nd.goalDir === 'down' ? v <= nd.goalTarget : v >= nd.goalTarget);
    const goalPct = nd => { const r = rec(nd.id); if (nd.goalTarget == null || !r) return 0;
      if (nd.goalDir === 'down') return r.value <= nd.goalTarget ? 100 : Math.max(0, Math.round(nd.goalTarget / r.value * 100));
      return Math.min(100, Math.max(0, Math.round(r.value / nd.goalTarget * 100))); };
    const eta = nd => (nd.freq === 'g' ? null : Math.ceil(Math.max(0, nd.need - count(nd.id)) / RATE[nd.freq]));
    const progress = () => {
      const sumNeed = SKILLS.reduce((a, x) => a + x.need, 0);
      const sumGot = SKILLS.reduce((a, x) => a + (isOn(x.id) ? x.need : Math.min(count(x.id), x.need)), 0);
      return { pct: sumNeed ? Math.floor(sumGot / sumNeed * 100) : 0, unlocked: SKILLS.filter(x => isOn(x.id)).length, total: SKILLS.length,
        caps: st.branches.filter(b => isOn(b.key + '4')).length, branches: st.branches.length };
    };
    return { st, NODES, ALL, SKILLS, isOn, isActive, count, pctOf, quota, weekCount, keyFor, checkedOn, satisfied, activeNodes, itemsOn,
      perDay: () => hasCheckMap, hasCheck, runs, streak, rec, goalMet, goalPct, eta, progress };
  }

  // ================= 変更（新しい状態を返す） =================
  // want: true=チェック, false=外す, undefined=切りかえ
  function applyCheck(st, id, day, want, today) {
    today = today || todayKey();
    const c = ctx(st), nd = c.NODES[id];
    if (!nd || id === 'root') return { st, status: 'notfound' };
    if (nd.freq === 'g') day = today;
    day = day || today;
    if (!isDate(day)) return { st, status: 'baddate' };
    if (day > today) return { st, status: 'future' };
    if (!c.itemsOn(day).some(x => x.id === id)) return { st, status: 'locked' };
    const key = c.keyFor(nd, day), on = !!st.checks[id]?.[key];
    const target = want === undefined ? !on : !!want;
    if (target === on) return { st, status: 'unchanged', checked: on };
    if (target && nd.freq[0] === 'w' && c.weekCount(id, day) >= c.quota(nd.freq)) return { st, status: 'quota' };
    const s = clone(st), m = s.checks[id] = s.checks[id] || {};
    if (target) m[key] = day; else delete m[key];
    if (!Object.keys(m).length) delete s.checks[id];
    let newly = null;
    const n2 = Object.keys(m).length;
    if (target && !s.unlocked[id] && n2 >= nd.need) { s.unlocked[id] = today; newly = id; }
    // 間違えて外したとき：今日解放したばかりで、次の段にまだチェックがなければ解放を取り消す
    if (!target && s.unlocked[id] === today && n2 < nd.need && !c.SKILLS.some(x => x.parents.includes(id) && c.count(x.id))) delete s.unlocked[id];
    stamp(s);
    const nexts = newly ? ctx(s).SKILLS.filter(x => x.parents.includes(newly) && ctx(s).isActive(x.id)).map(x => x.name) : [];
    return { st: s, status: target ? 'checked' : 'unchecked', checked: target, newly, nexts };
  }
  function applyRecord(st, id, value, today) {
    today = today || todayKey();
    const c = ctx(st), nd = c.NODES[id];
    if (!nd || nd.freq !== 'g') return { st, status: 'notgoal' };
    const v = +value; if (!Number.isFinite(v)) return { st, status: 'badvalue' };
    const prev = c.rec(id), better = !prev || (nd.goalDir === 'down' ? v < prev.value : v > prev.value);
    let s = clone(st);
    if (better) s.records[id] = { value: v, date: today };
    stamp(s);
    let res = { st: s, status: 'recorded', better, best: better ? v : prev.value };
    if (c.goalMet(nd, v) && c.isActive(id)) { const r = applyCheck(s, id, today, true, today); res = { ...res, st: r.st, newly: r.newly, nexts: r.nexts, achieved: r.status === 'checked' }; }
    return res;
  }
  function setOff(st, day, off) { const s = clone(st); if (off) s.off[day] = true; else delete s.off[day]; return stamp(s); }
  function setTitle(st, title) { const s = clone(st); s.title = String(title || '').trim().slice(0, 40) || 'スキルツリー'; return stamp(s); }
  function addBranch(st, data) {
    if (st.branches.length >= MAX_BRANCHES) return { st, status: 'full' };
    const s = clone(st); data = data || {};
    const nodes = {};
    const skills = Array.isArray(data.skills) ? data.skills : [];
    SLOTS.forEach((sl, i) => { nodes[sl] = skills[i] || (data.nodes && data.nodes[sl]) || { icon: 'star', name: `スキル${i + 1}`, freq: 'd' }; });
    const b = cleanBranch({ key: data.key && !s.branches.some(x => x.key === data.key) ? data.key : newKey(), name: data.name, en: data.en, color: data.color, nodes }, s.branches.length);
    s.branches.push(b);
    return { st: stamp(s), status: 'added', key: b.key };
  }
  function updateBranch(st, key, f) {
    const s = clone(st), b = s.branches.find(x => x.key === key); if (!b) return { st, status: 'notfound' };
    if (f.name != null) b.name = String(f.name).slice(0, 20) || b.name;
    if (f.en != null) b.en = String(f.en).slice(0, 20);
    if (f.color != null && /^#[0-9a-f]{6}$/i.test(f.color)) b.color = f.color;
    return { st: stamp(s), status: 'updated' };
  }
  function updateSkill(st, id, f) {
    const c = ctx(st), nd = c.NODES[id]; if (!nd || id === 'root') return { st, status: 'notfound' };
    const s = clone(st), b = s.branches.find(x => x.key === nd.branch.key), cur = b.nodes[nd.slot];
    const next = { ...cur, ...f };
    if (f.freq && f.freq !== cur.freq && f.need == null) next.need = yearNeed(nd.level, f.freq);
    b.nodes[nd.slot] = cleanNode(next, nd.slot);
    let newly = null;
    if (c.isActive(id) && c.count(id) >= b.nodes[nd.slot].need) { s.unlocked[id] = todayKey(); newly = id; }
    return { st: stamp(s), status: 'updated', newly };
  }
  function deleteBranch(st, key) {
    const s = clone(st), b = s.branches.find(x => x.key === key); if (!b) return { st, status: 'notfound' };
    SLOTS.forEach(sl => { const id = key + sl; delete s.checks[id]; delete s.unlocked[id]; delete s.records[id]; });
    s.branches = s.branches.filter(x => x.key !== key);
    return { st: stamp(s), status: 'deleted', name: b.name };
  }
  function yearAll(st) { const s = clone(st); s.branches.forEach(b => SLOTS.forEach(sl => { b.nodes[sl].need = yearNeed(LEVEL[sl], b.nodes[sl].freq); })); return stamp(s); }
  function newTree(mode, title) { const s = mode === 'template' ? fresh() : blank(title); if (title) s.title = String(title).slice(0, 40); return stamp(s); }

  // 2か所で同時に変わったときの合わせ方：中身（系統）は新しい方、記録は両方を足し合わせる
  function merge(a, b) {
    const newer = (a.updatedAt || '') >= (b.updatedAt || '') ? a : b, older = newer === a ? b : a;
    const s = clone(newer);
    const ids = new Set(s.branches.flatMap(x => SLOTS.map(sl => x.key + sl)));
    for (const id in older.checks) if (ids.has(id)) s.checks[id] = { ...older.checks[id], ...(s.checks[id] || {}) };
    for (const id in older.unlocked) if (ids.has(id) && (!s.unlocked[id] || older.unlocked[id] < s.unlocked[id])) s.unlocked[id] = older.unlocked[id];
    for (const k in older.off) s.off[k] = true;
    const c = ctx(s);
    for (const id in older.records) { if (!ids.has(id)) continue; const o = older.records[id], n = s.records[id], nd = c.NODES[id];
      if (!n || (nd.goalDir === 'down' ? o.value < n.value : o.value > n.value)) s.records[id] = o; }
    return stamp(s);
  }

  // ================= AI が作ったツリーを読む =================
  const PROMPT = `あなたは成長計画を作るコーチです。下の「身につけたいこと」をもとに、スキルツリーを JSON だけで出力してください。JSON の前後に説明文は書かないでください。

身につけたいこと：
{{WISH}}

ルール
- branches（系統）は1〜6個。各系統の skills はちょうど6個で、順番は「1段目 → 2段目A → 2段目B → 3段目A → 3段目B → 最終」。
- 1段目はすぐ始められること、最終は1年かけて届くゴールにする。
- act は毎日確認でチェックする具体的な行動を1文で書く（60文字くらい。「〜する」で終える）。
- freq は d（毎日）/ w1・w2・w3（週1〜3回）/ m1（月1回）/ g（達成目標）のどれか。
- 数字で測れるゴール（例：ベンチプレス100kg、TOEIC800点、体脂肪率15%）は freq を g にし、goalTarget（数値）・goalUnit（単位）・goalDir（up＝この数値以上で達成、down＝この数値以下で達成）を入れる。
- icon は Lucide のアイコン名（例：dumbbell, brain, target, book-open, messages-square, languages, heart, shield）。
- 系統の name は10文字以内、en は英大文字。スキルの name は20文字以内、desc は60文字以内。
- need は書かない（アプリが1年で届く回数を自動で決める）。
- 引用符は半角の " を使い、skills は必ず [ ] で囲む。JSON はコードブロック1つにまとめる。

形式
{
  "title": "ツリーの名前",
  "branches": [
    {
      "name": "系統名", "en": "ENGLISH", "color": "#86ace0",
      "skills": [
        { "name": "スキル名", "icon": "eye", "desc": "説明", "act": "確認すること", "freq": "d" },
        { "name": "スキル名", "icon": "target", "desc": "説明", "act": "確認すること", "freq": "g", "goalTarget": 100, "goalUnit": "kg", "goalDir": "up" }
      ]
    }
  ]
}`;
  const prompt = wish => PROMPT.replace('{{WISH}}', String(wish || '').trim() || '（ここに身につけたいことを書く）');

  // よくある崩れを直してから読む：“ ” などの引用符、\[ \] のようなエスケープ、末尾のカンマ、"skills" の [ ] の抜け
  function parseLoose(txt) {
    const tries = [t => t, t => t.replace(/[\u201C\u201D\u201E\u201F\u2033\uFF02]/g, '"').replace(/[\u2018\u2019]/g, "'"),
      t => t.replace(/\\([\[\]_*#()~`>-])/g, '$1'), t => t.replace(/,\s*([}\]])/g, '$1'), fixSkillArrays];
    let t = txt;
    for (const f of tries) { t = f(t); try { return JSON.parse(t); } catch (e) {} }
    return null;
  }
  // "skills": { … }, { … } のように [ ] が抜けているとき、続くオブジェクトをまとめて [ ] で囲む
  function fixSkillArrays(t) {
    const re = /"(skills|nodes)"\s*:\s*\{/g; let out = '', last = 0, m;
    while ((m = re.exec(t))) {
      const start = m.index + m[0].length - 1;
      if (/"\s*1\s*"\s*:/.test(t.slice(start, start + 20))) continue; // nodes: {"1": …} の正しい形
      let i = start, end = start;
      while (true) {
        const e = skipObject(t, i); if (e < 0) return t;
        end = e; let j = e; while (/\s/.test(t[j])) j++;
        if (t[j] === ',') { let k = j + 1; while (/\s/.test(t[k])) k++; if (t[k] === '{') { i = k; continue; } }
        break;
      }
      let after = end; while (/\s/.test(t[after])) after++;
      out += t.slice(last, start) + '[' + t.slice(start, end) + ']';
      last = end; re.lastIndex = end;
    }
    return out + t.slice(last);
  }
  function skipObject(t, i) { // t[i] は {。対応する } の次の位置を返す
    let depth = 0, inStr = false;
    for (; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (depth === 0) return i + 1; }
    }
    return -1;
  }

  // AI の返事（前後の文章や \`\`\`json の囲みがあってもよい）からツリーを取り出す
  function parseTree(text) {
    let raw = String(text || '').trim();
    if (!raw) return { ok: false, error: 'AIの返事が空です' };
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) raw = fence[1];
    const a = Math.min(...['{', '['].map(c => { const i = raw.indexOf(c); return i < 0 ? Infinity : i; }));
    const z = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (!Number.isFinite(a) || z < a) return { ok: false, error: 'JSON が見つかりません。AIの返事をそのまま貼り付けてください' };
    const d = parseLoose(raw.slice(a, z + 1));
    if (!d) return { ok: false, error: 'JSON の形が崩れています。AIに「正しいJSONだけで出し直して」と頼んでください' };
    const list = Array.isArray(d) ? d : Array.isArray(d.branches) ? d.branches : Array.isArray(d.tree) ? d.tree : null;
    if (!list || !list.length) return { ok: false, error: 'branches（系統）が入っていません' };
    const notes = [];
    if (list.length > MAX_BRANCHES) notes.push(`系統が${list.length}個あったので、最初の${MAX_BRANCHES}個を使います`);
    const branches = list.slice(0, MAX_BRANCHES).map((b, i) => {
      b = b || {};
      let skills = Array.isArray(b.skills) ? b.skills : Array.isArray(b.nodes) ? b.nodes : b.nodes && typeof b.nodes === 'object' ? SLOTS.map(s => b.nodes[s]) : [];
      skills = skills.filter(Boolean);
      if (skills.length > 6) notes.push(`「${b.name || '系統' + (i + 1)}」はスキルが${skills.length}個あったので、6個にしました`);
      if (skills.length < 6) notes.push(`「${b.name || '系統' + (i + 1)}」はスキルが${skills.length}個だったので、足りない分を仮の名前で作りました`);
      const nodes = {};
      SLOTS.forEach((s, j) => { const n = skills[j] || {};
        nodes[s] = { ...n, goalTarget: n.goalTarget ?? n.goal_target, goalUnit: n.goalUnit ?? n.goal_unit, goalDir: n.goalDir ?? n.goal_dir,
          act: n.act ?? n.action ?? n.check, need: n.need, freq: FREQ[n.freq] ? n.freq : (n.goalTarget ?? n.goal_target) != null ? 'g' : n.freq }; });
      return cleanBranch({ key: '', name: b.name, en: b.en ? String(b.en).toUpperCase() : '', color: b.color, nodes }, i);
    });
    const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim().slice(0, 40) : '';
    return { ok: true, title, branches, notes, skills: branches.length * 6 };
  }
  // 読み取ったツリーにする。keep=true なら、同じ名前の系統は記録を引き継ぐ
  function applyTree(st, tree, keep) {
    const s = clone(st), old = s.branches, used = new Set();
    const branches = tree.branches.map(b => { const nb = clone(b);
      const same = keep && old.find(o => o.name === nb.name && !used.has(o.key));
      if (same) { nb.key = same.key; used.add(same.key); } else nb.key = newKey() + used.size;
      used.add(nb.key); return nb; });
    s.branches = branches; if (tree.title) s.title = tree.title;
    const ids = new Set(branches.flatMap(b => SLOTS.map(x => b.key + x)));
    for (const f of ['checks', 'unlocked', 'records']) for (const id in s[f]) if (!keep || !ids.has(id)) delete s[f][id];
    if (!keep) s.off = {};
    return { st: stamp(s), status: 'applied', kept: branches.filter(b => old.some(o => o.key === b.key)).map(b => b.name) };
  }

  return { PROMPT, prompt, parseTree, applyTree, SLOTS, LEVEL, PARENTS, FREQ, RATE, SPAN, MAX_BRANCHES, yearNeed, W, H, CX, CY, pt,
    keyOf, parseKey, addDays, todayKey, monOf, isDate, clone,
    fresh, blank, normalize, ctx, applyCheck, applyRecord, setOff, setTitle, addBranch, updateBranch, updateSkill, deleteBranch, yearAll, newTree, merge };
});
