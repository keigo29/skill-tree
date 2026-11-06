#!/usr/bin/env node
// スキルツリーの MCP サーバー（stdio）
// データの置き場所：
//   GITHUB_TOKEN と SKILLTREE_GIST_ID があれば GitHub Gist（アプリと同じデータ）
//   なければ SKILLTREE_FILE（既定：~/.skilltree.json）
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const K = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'core.js'));

// ================= 保存先 =================
const TOKEN = process.env.GITHUB_TOKEN || process.env.SKILLTREE_GITHUB_TOKEN || '';
const GIST = (process.env.SKILLTREE_GIST_ID || '').trim();
const FILE = process.env.SKILLTREE_FILE || join(homedir(), '.skilltree.json');
const useGist = !!(TOKEN && GIST);
const GH = 'https://api.github.com';
const head = () => ({ Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'skilltree-mcp' });

async function load() {
  if (useGist) {
    const r = await fetch(`${GH}/gists/${GIST}`, { headers: head() });
    if (!r.ok) throw new Error(`Gist を読めませんでした（${r.status}）。GITHUB_TOKEN と SKILLTREE_GIST_ID を確かめてください`);
    const j = await r.json(), f = j.files && j.files['skilltree.json'];
    if (!f) return K.fresh();
    const txt = f.truncated ? await (await fetch(f.raw_url, { headers: head() })).text() : f.content;
    return K.normalize(JSON.parse(txt));
  }
  try { return K.normalize(JSON.parse(await readFile(FILE, 'utf8'))); }
  catch (e) { if (e.code === 'ENOENT') return K.fresh(); throw e; }
}
async function save(st) {
  const body = JSON.stringify(st, null, 1);
  if (useGist) {
    const r = await fetch(`${GH}/gists/${GIST}`, { method: 'PATCH', headers: { ...head(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'skilltree.json': { content: body } } }) });
    if (!r.ok) throw new Error(`Gist に保存できませんでした（${r.status}）`);
    return;
  }
  const tmp = FILE + '.tmp';
  await writeFile(tmp, body); await rename(tmp, FILE);
}

// ================= 表示用 =================
const FREQ = K.FREQ;
const today = () => K.todayKey();
function skillLine(c, n, day) {
  const on = c.isOn(n.id), act = c.isActive(n.id);
  let prog;
  if (n.freq === 'g') { const r = c.rec(n.id); prog = n.goalTarget != null ? `記録 ${r ? r.value : '—'} / ${n.goalTarget}${n.goalUnit}` : '達成したらチェック'; }
  else prog = `${Math.min(c.count(n.id), n.need)}/${n.need}回`;
  const state = on ? `解放済み(${c.st.unlocked[n.id]})` : act ? '挑戦中' : '未解放';
  let line = `- [${n.id}] ${n.name}（${FREQ[n.freq]}・${state}・${prog}）`;
  if (day && (act || c.st.unlocked[n.id] === day)) {
    const chk = c.checkedOn(n, day);
    let mark = chk ? 'チェック済み' : '未チェック';
    if (n.freq[0] === 'w') mark += `・今週 ${c.weekCount(n.id, day)}/${c.quota(n.freq)}`;
    line += ` …${mark}\n    確認すること：${n.act || '（未設定）'}`;
  }
  return line;
}
function overview(st) {
  const c = K.ctx(st), P = c.progress(), t = today();
  const lines = [`# ${st.title}（期間 ${K.periodLabel(st.period)}）`, `進み具合 ${P.pct}%・解放 ${P.unlocked}/${P.total}・最終スキル ${P.caps}/${P.branches}・連続 ${c.streak()}日`,
    `保存先：${useGist ? `Gist ${GIST}` : FILE}`];
  if (!st.branches.length) lines.push('', '系統がまだありません。add_branch で作ってください。');
  for (const b of st.branches) {
    lines.push('', `## ${b.name}（key: ${b.key}${b.en ? ' / ' + b.en : ''}・色 ${b.color}）`);
    K.SLOTS.forEach(s => lines.push(skillLine(c, c.NODES[b.key + s])));
  }
  return lines.join('\n');
}
function checksText(st, day) {
  const c = K.ctx(st), items = c.itemsOn(day);
  if (!items.length) return `${day}：確認項目はありません`;
  const daily = items.filter(n => n.freq !== 'g'), done = daily.filter(n => c.satisfied(n, day)).length;
  return [`${day}${st.off[day] ? '（休みの日）' : ''}：${done}/${daily.length} できています`, ...items.map(n => skillLine(c, n, day))].join('\n');
}
const ok = text => ({ content: [{ type: 'text', text }] });
const fail = text => ({ content: [{ type: 'text', text }], isError: true });
const dateArg = z.string().regex(/^\d{4}-\d\d-\d\d$/).optional().describe('YYYY-MM-DD。省略すると今日');

// 変更は「読む→変える→保存」を1回で行う
async function mutate(fn) {
  const st = await load();
  const res = fn(st);
  if (res && res.st && res.st !== st) await save(res.st);
  return res;
}

const skillShape = {
  name: z.string().max(30).describe('スキルの名前'),
  icon: z.string().max(40).optional().describe('Lucide のアイコン名（例：dumbbell, brain, target）'),
  desc: z.string().max(200).optional().describe('説明'),
  act: z.string().max(120).optional().describe('確認すること（毎日確認に出る文）'),
  freq: z.enum(['d', 'w1', 'w2', 'w3', 'm1', 'g']).optional().describe('d=毎日 w1〜w3=週N回 m1=月1回 g=達成目標'),
  need: z.number().int().min(1).max(999).optional().describe('解放に必要なチェック回数。省略すると1年ペースの回数'),
  goal_target: z.number().optional().describe('達成目標の数値（freq=g のとき）'),
  goal_unit: z.string().max(10).optional().describe('達成目標の単位（例：kg）'),
  goal_dir: z.enum(['up', 'down']).optional().describe('up=この数値以上で達成 down=この数値以下で達成'),
  metric: z.string().max(20).optional().describe('記録の名前。同じ名前の達成目標どうしで記録を共有する（例：ベンチプレス 60kg→80kg→100kg）')
};
const toNode = s => { const o = { ...s }; if ('goal_target' in o) { o.goalTarget = o.goal_target; delete o.goal_target; }
  if ('goal_unit' in o) { o.goalUnit = o.goal_unit; delete o.goal_unit; } if ('goal_dir' in o) { o.goalDir = o.goal_dir; delete o.goal_dir; }
  for (const k in o) if (o[k] === undefined) delete o[k]; return o; };

// ================= サーバー =================
const server = new McpServer({ name: 'skilltree', version: '1.0.0' }, {
  instructions: 'チェックした回数でスキルが解放されるスキルツリー。ツリーは最大6系統、各系統6スキル（slot 1→2a/2b→3a/3b→4）。' +
    'スキルIDは「系統key＋slot」（例：kin4）。まず get_overview で現在の形とIDを確かめてから操作してください。'
});

server.registerTool('get_overview', { title: 'ツリー全体を見る', description: 'タイトル・進み具合・全系統と全スキル（ID・頻度・状態・回数）を返す',
  inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ok(overview(await load())));

server.registerTool('list_checks', { title: 'その日の確認項目', description: '指定日（省略で今日）に確認する項目と、チェック済みかどうかを返す',
  inputSchema: { date: dateArg }, annotations: { readOnlyHint: true } }, async ({ date }) => ok(checksText(await load(), date || today())));

server.registerTool('check', { title: '確認項目をチェックする', description: 'スキルの確認項目をチェック（done=false で外す）。必要回数に届くと自動で解放され、次の段が確認項目になる。週N回の項目は今週の回数が上限ならチェックできない',
  inputSchema: { skill_id: z.string().describe('スキルID（例：judge1, kin2a）'), date: dateArg, done: z.boolean().optional().describe('true=チェック（既定）false=外す') } },
  async ({ skill_id, date, done }) => {
    const r = await mutate(st => K.applyCheck(st, skill_id, date || today(), done === undefined ? true : done));
    const msg = { notfound: `スキル ${skill_id} が見つかりません`, baddate: '日付は YYYY-MM-DD で指定してください', future: '先の日はチェックできません',
      locked: 'このスキルはまだ挑戦中ではありません（前の段を解放すると挑戦できます）', quota: '今週の回数はもう達成済みです' }[r.status];
    if (msg) return fail(msg);
    const c = K.ctx(r.st), n = c.NODES[skill_id];
    let t = r.status === 'unchanged' ? `${n.name}：すでに${r.checked ? 'チェック済み' : '未チェック'}です` : `${n.name}を${r.checked ? 'チェック' : '未チェックに'}しました（${n.freq === 'g' ? '達成目標' : `${Math.min(c.count(n.id), n.need)}/${n.need}回`}）`;
    if (r.newly) t += `\n⚡「${n.name}」を${n.freq === 'g' ? '達成' : '解放'}しました。${r.chain.length ? `ほかに ${r.chain.map(i => c.NODES[i].name).join('・')} も解放。` : ''}${r.nexts.length ? '次の確認項目：' + r.nexts.join('・') : ''}`;
    return ok(t);
  });

server.registerTool('record_goal', { title: '達成目標の記録を入れる', description: '達成目標（freq=g）のスキルに今日の記録を入れる。ベスト更新なら保存し、目標に届けば自動で達成・解放',
  inputSchema: { skill_id: z.string(), value: z.number() } },
  async ({ skill_id, value }) => {
    const r = await mutate(st => K.applyRecord(st, skill_id, value));
    if (r.status === 'notgoal') return fail(`${skill_id} は達成目標のスキルではありません`);
    const n = K.ctx(r.st).NODES[skill_id];
    let t = r.better ? `${n.name}：自己ベスト ${value}${n.goalUnit} を記録しました` : `${n.name}：${value}${n.goalUnit}（ベストは ${r.best}${n.goalUnit}）`;
    if (n.goalTarget != null) t += `・目標 ${n.goalTarget}${n.goalUnit}`;
    if (r.newly) { const c2 = K.ctx(r.st); t += `\n⚡ 目標達成！ ${[r.newly, ...r.chain].map(i => '「' + c2.NODES[i].name + '」').join('')}を解放しました${r.nexts.length ? '。次：' + r.nexts.join('・') : ''}`; }
    return ok(t);
  });

server.registerTool('set_day_off', { title: '休みの日にする', description: '休みの日にすると、連続記録が途切れない',
  inputSchema: { date: dateArg, off: z.boolean().default(true) } },
  async ({ date, off }) => { const d = date || today(); await mutate(st => ({ st: K.setOff(st, d, off) })); return ok(`${d} を${off ? '休みの日にしました' : '休みの日から外しました'}`); });

server.registerTool('get_history', { title: '積み上げを見る', description: '直近N日の、日ごとのチェック数（草グラフの中身）',
  inputSchema: { days: z.number().int().min(1).max(366).default(30) }, annotations: { readOnlyHint: true } },
  async ({ days }) => {
    const st = await load(), c = K.ctx(st), per = c.perDay(), t = today(); const rows = [];
    for (let i = days - 1; i >= 0; i--) { const k = K.addDays(t, -i); rows.push(`${k} ${'■'.repeat(Math.min(per[k] || 0, 10)) || '·'} ${per[k] || 0}${st.off[k] ? '（休み）' : ''}`); }
    return ok(`連続 ${c.streak()}日・最長 ${Math.max(0, ...c.runs())}日\n` + rows.join('\n'));
  });

server.registerTool('new_tree', { title: 'ツリーを作り直す', description: 'mode=blank で空のツリー（ゼロから作る）、mode=template で見本のツリー。今の系統と記録はすべて消える。confirm=true が必要',
  inputSchema: { mode: z.enum(['blank', 'template']), title: z.string().max(40).optional(), confirm: z.literal(true).describe('消えることを確認したら true') },
  annotations: { destructiveHint: true } },
  async ({ mode, title }) => { const st = K.newTree(mode, title); await save(st); return ok(`${mode === 'blank' ? '空のツリー' : '見本のツリー'}で作り直しました。\n\n` + overview(st)); });

server.registerTool('import_tree', { title: 'JSON でツリーを入れかえる', description: 'title と branches（各系統に6つの skills）を持つ JSON 文字列でツリーを丸ごと入れかえる。形式は get_tree_format で確認できる。keep_records=true なら同じ名前の系統の記録を引き継ぐ。confirm=true が必要',
  inputSchema: { tree_json: z.string().describe('ツリーの JSON（AI の返事をそのまま渡してもよい）'), keep_records: z.boolean().default(true), confirm: z.literal(true) },
  annotations: { destructiveHint: true } },
  async ({ tree_json, keep_records }) => {
    let t; const r = await mutate(st => { t = K.parseTree(tree_json, st.period); return t.ok ? K.applyTree(st, t, keep_records) : { st }; });
    if (!t.ok) return fail(t.error);
    return ok(`ツリーを入れかえました（${t.branches.length}系統・${t.skills}スキル）${r.kept.length ? `。記録を引き継いだ系統：${r.kept.join('・')}` : ''}${t.notes.length ? '\n' + t.notes.join('\n') : ''}\n\n` + overview(r.st));
  });

server.registerTool('get_tree_format', { title: 'ツリーの JSON の形式', description: 'import_tree に渡す JSON の形式とルール（AI にツリーを作らせるときの指示文）を返す',
  inputSchema: { wish: z.string().optional().describe('身につけたいこと（指示文に入る）'), months: z.number().int().min(1).max(36).default(12).describe('最終スキルまでの期間（か月）'),
    style: z.enum(['mix', 'habit', 'goal']).default('mix').describe('mix=習慣とゴールの組み合わせ habit=習慣中心 goal=ゴール達成で進む') }, annotations: { readOnlyHint: true } },
  async ({ wish, months, style }) => ok(K.prompt(wish, { months, style })));

server.registerTool('set_period', { title: '期間を変える', description: '最終スキルまでの期間を変え、全スキルの必要回数を計算し直す。チェック回数は残り、届いていれば解放される',
  inputSchema: { months: z.number().min(0.5).max(36).describe('か月（1=1か月, 3, 6, 12, 24 など）') } },
  async ({ months }) => { const r = await mutate(st => K.setPeriod(st, K.monthsToDays(months))); const c = K.ctx(r.st);
    return ok(`期間を${K.periodLabel(r.st.period)}にしました${r.unlocked.length ? `。${r.unlocked.map(i => c.NODES[i].name).join('・')} を解放` : ''}\n\n` + overview(r.st)); });

server.registerTool('set_title', { title: 'タイトルを変える', inputSchema: { title: z.string().min(1).max(40) } },
  async ({ title }) => { await mutate(st => ({ st: K.setTitle(st, title) })); return ok(`タイトルを「${title}」にしました`); });

server.registerTool('add_branch', { title: '系統を追加する', description: '系統（最大6つ）を追加。skills に6つまでのスキルを順に渡す（1段目、2段目A、2段目B、3段目A、3段目B、最終）。足りない分は仮の名前で作られる',
  inputSchema: { name: z.string().min(1).max(20), en: z.string().max(20).optional().describe('英字ラベル'), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    skills: z.array(z.object(skillShape)).max(6).optional() } },
  async ({ name, en, color, skills }) => {
    const r = await mutate(st => K.addBranch(st, { name, en, color, skills: (skills || []).map(toNode) }));
    if (r.status === 'full') return fail('系統は6つまでです');
    return ok(`系統「${name}」を追加しました（key: ${r.key}）\n\n` + overview(r.st));
  });

server.registerTool('update_branch', { title: '系統を変える', inputSchema: { branch_key: z.string(), name: z.string().max(20).optional(), en: z.string().max(20).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() } },
  async ({ branch_key, ...f }) => { const r = await mutate(st => K.updateBranch(st, branch_key, f)); return r.status === 'notfound' ? fail(`系統 ${branch_key} が見つかりません`) : ok('系統を更新しました'); });

server.registerTool('update_skill', { title: 'スキルを変える', description: '名前・アイコン・説明・確認すること・頻度・必要回数・達成目標を変える。頻度を変えて need を省くと1年ペースの回数になる',
  inputSchema: { skill_id: z.string(), ...Object.fromEntries(Object.entries(skillShape).map(([k, v]) => [k, k === 'name' ? v.optional() : v])) } },
  async ({ skill_id, ...f }) => {
    const r = await mutate(st => K.updateSkill(st, skill_id, toNode(f)));
    if (r.status === 'notfound') return fail(`スキル ${skill_id} が見つかりません`);
    const c = K.ctx(r.st);
    return ok(skillLine(c, c.NODES[skill_id]) + (r.newly ? '\n⚡ 必要回数に届いていたので解放しました' : ''));
  });

server.registerTool('delete_branch', { title: '系統を削除する', description: '系統とその記録を消す。confirm=true が必要',
  inputSchema: { branch_key: z.string(), confirm: z.literal(true) }, annotations: { destructiveHint: true } },
  async ({ branch_key }) => { const r = await mutate(st => K.deleteBranch(st, branch_key)); return r.status === 'notfound' ? fail(`系統 ${branch_key} が見つかりません`) : ok(`系統「${r.name}」を削除しました`); });

await server.connect(new StdioServerTransport());
