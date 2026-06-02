/* ============================================================
   kolar 控制台 · Claude Task Runner board
   - 实时读取 /api/system /api/tasks /api/projects /api/keepalive
   - 离线（无后端）时回退到本地快照演示数据，UI 完全一致
   ============================================================ */

/* ---------- Spectrum 2 workflow icon paths ---------- */
const ICONS = {
  home:"m17.13086,5.73438L11.38086,1.26172c-.8125-.63086-1.94922-.63184-2.76172.00098L2.86914,5.73438h-.00098c-.54395.42285-.86816,1.08691-.86816,1.77637v8.23926c0,1.24023,1.00977,2.25,2.25,2.25h11.5c1.24023,0,2.25-1.00977,2.25-2.25V7.51074c0-.68945-.32422-1.35352-.86914-1.77637Zm-5.63086,10.76562h-3v-4.75c0-.41309.33691-.75.75-.75h1.5c.41309,0,.75.33691.75.75v4.75Zm5-.75c0,.41309-.33691.75-.75.75h-2.75v-4.75c0-1.24023-1.00977-2.25-2.25-2.25h-1.5c-1.24023,0-2.25,1.00977-2.25,2.25v4.75h-2.75c-.41309,0-.75-.33691-.75-.75V7.51074c0-.22949.1084-.45117.28906-.59277l5.75-4.4707c.27246-.21191.65137-.20898.92188-.00098l5.74902,4.47168c.18164.1416.29004.36328.29004.59277v8.23926Z",
  folder:"m16.75,5h-5.96387c-.21777,0-.42383-.09473-.56689-.25879l-1.70361-1.96484c-.42773-.49316-1.04736-.77637-1.7002-.77637h-3.56543c-1.24072,0-2.25,1.00977-2.25,2.25v10.5c0,1.24023,1.00928,2.25,2.25,2.25h13.5c1.24072,0,2.25-1.00977,2.25-2.25v-7.5c0-1.24023-1.00928-2.25-2.25-2.25ZM3.25,3.5h3.56543c.21777,0,.42383.09473.56689.25879l1.07617,1.24121H2.5v-.75c0-.41309.33643-.75.75-.75Zm14.25,11.25c0,.41309-.33643.75-.75.75H3.25c-.41357,0-.75-.33691-.75-.75V6.5h14.25c.41357,0,.75.33691.75.75v7.5Z",
  bell:"m17.78613,12.67578c-.16846-.30859-.34082-.60742-.51123-.90234-.82666-1.43457-1.54102-2.67285-1.54102-4.62012,0-3.11914-2.5376-5.65723-5.65723-5.65723s-5.65723,2.53809-5.65723,5.65723c0,1.7666-.75879,3.04883-1.56201,4.40527-.22021.37207-.44141.74609-.64941,1.13086-.37598.69629-.35693,1.52051.05078,2.2041.41211.69043,1.13672,1.10254,1.93848,1.10254h3.05225c0,1.5166,1.2334,2.75,2.75,2.75s2.75-1.2334,2.75-2.75h3.05518c.80322,0,1.52783-.41309,1.93896-1.10547.40771-.6875.42383-1.51562.04248-2.21484Zm-7.78662,4.57031c-.68945,0-1.25-.56055-1.25-1.25h2.5c0,.68945-.56055,1.25-1.25,1.25Zm6.4541-3.12109c-.06641.11133-.26221.37109-.64893.37109H4.19727c-.26855,0-.51172-.13867-.65039-.37109-.06445-.1084-.19531-.39551-.01855-.72266.19824-.36816.40967-.72461.61963-1.0791.87109-1.4707,1.77148-2.99219,1.77148-5.16992,0-2.25391,1.90381-4.15723,4.15723-4.15723s4.15723,1.90332,4.15723,4.15723c0,2.34863.88525,3.88379,1.7417,5.36914.16455.28516.33057.57324.49365.87207.18066.33105.04932.62109-.01562.73047Z",
  send:"M14.52734,7.4668l-4.00293-3.99707c-.29395-.29395-.76855-.29199-1.06055,0l-3.99707,3.99707c-.29297.29297-.29297.76758,0,1.06055.14648.14648.33789.21973.53027.21973s.38379-.07324.53027-.21973l2.72363-2.72363v9.94629c0,.41406.33594.75.75.75s.75-.33594.75-.75V5.81616l2.71582,2.71118c.29395.29395.76855.29199,1.06055,0,.29297-.29297.29297-.76855,0-1.06055Z",
  copy:"m11.75,18h-7.5c-1.24023,0-2.25-1.00977-2.25-2.25v-7.5c0-1.24023,1.00977-2.25,2.25-2.25.41406,0,.75.33594.75.75s-.33594.75-.75.75c-.41309,0-.75.33691-.75.75v7.5c0,.41309.33691.75.75.75h7.5c.41309,0,.75-.33691.75-.75,0-.41406.33594-.75.75-.75s.75.33594.75.75c0,1.24023-1.00977,2.25-2.25,2.25Zm4-4h-7.5c-1.24023,0-2.25-1.00977-2.25-2.25v-7.5c0-1.24023,1.00977-2.25,2.25-2.25h7.5c1.24023,0,2.25,1.00977,2.25,2.25v7.5c0,1.24023-1.00977,2.25-2.25,2.25Zm-7.5-12.5c-.41309,0-.75.33691-.75.75v7.5c0,.41309.33691.75.75.75h7.5c.41309,0,.75-.33691.75-.75V4.25c0-.41309-.33691-.75-.75-.75h-7.5Z",
  edit:"m17.78076,1.75684c-1.27197-1.04102-3.22705-.89844-4.4502.32324L3.07764,12.33398c-.32031.31934-.55859.7168-.68896,1.15039l-1.38428,4.58398c-.08008.26465-.00781.55176.1875.74707.14258.14258.33447.21973.53027.21973.07227,0,.14551-.01074.2168-.03223l4.58252-1.38379c.43359-.12988.83154-.36816,1.15088-.68848,0,0,10.16846-10.16797,10.35547-10.35547.64795-.64746.99316-1.54492.94775-2.45996-.0459-.91504-.48145-1.77539-1.19482-2.3584ZM2.84473,17.16309l.97998-3.24609c.02716-.09033.06714-.17578.11377-.25732l2.40869,2.40918c-.08154.04639-.16718.08643-.25781.11377l-3.24463.98047Zm14.12158-11.64746c-.15472.15552-7.09985,7.1001-9.52545,9.52588l-2.47461-2.4751L14.39111,3.14062c.38623-.38672.896-.58594,1.38965-.58594.38086,0,.75244.11914,1.05029.3623.3916.32129.62109.77246.646,1.27246.0249.49316-.16113.97656-.51074,1.32617Z",
  add:"m16.25,9.25h-5.5V3.75c0-.41406-.33594-.75-.75-.75s-.75.33594-.75.75v5.5H3.75c-.41406,0-.75.33594-.75.75s.33594.75.75.75h5.5v5.5c0,.41406.33594.75.75.75s.75-.33594.75-.75v-5.5h5.5c.41406,0,.75-.33594.75-.75s-.33594-.75-.75-.75Z",
  download:"m13.53027,9.42676c-.29199-.29199-.7666-.29395-1.06055,0l-1.7168,1.71411V2.75c0-.41406-.33594-.75-.75-.75s-.75.33594-.75.75v8.39941l-1.72266-1.72266c-.29297-.29297-.76758-.29297-1.06055,0s-.29297.76758,0,1.06055l2.99805,2.99805c.14648.14648.33789.21973.53027.21973.19141,0,.38379-.07324.53027-.21973l3.00195-2.99805c.29297-.29199.29297-.76758,0-1.06055Zm2.71973,4.32324c-.41406,0-.75.33594-.75.75v1.5c0,.41309-.33691.75-.75.75H5.25c-.41309,0-.75-.33691-.75-.75v-1.5c0-.41406-.33594-.75-.75-.75s-.75.33594-.75.75v1.5c0,1.24023,1.00928,2.25,2.25,2.25h9.5c1.24072,0,2.25-1.00977,2.25-2.25v-1.5c0-.41406-.33594-.75-.75-.75Z",
  play:"M6.30225,2.96094c-.24316-.14844-.5459-.15527-.79688-.0166-.25.13672-.40527.39941-.40527.68457v12.71387c0,.28516.15527.54785.40527.68457.11719.06445.24609.09668.375.09668.14062,0,.28125-.03906.40918-.11328l10.69434-6.35693c.24023-.14258.3877-.40137.3877-.68066s-.14746-.53809-.3877-.68066L6.30225,2.96094Z",
  user:"m10,11.25c-2.61914,0-4.75-2.24316-4.75-5S7.38086,1.25,10,1.25s4.75,2.24316,4.75,5-2.13086,5-4.75,5Zm0-8.5c-1.79199,0-3.25,1.57031-3.25,3.5s1.45801,3.5,3.25,3.5,3.25-1.57031,3.25-3.5-1.45801-3.5-3.25-3.5Zm6.75,15.5c-.41406,0-.75-.33594-.75-.75,0-2.89941-2.35059-5.25-5.25-5.25h-1.5c-2.89941,0-5.25,2.35059-5.25,5.25,0,.41406-.33594.75-.75.75s-.75-.33594-.75-.75c0-3.72656,3.02344-6.75,6.75-6.75h1.5c3.72656,0,6.75,3.02344,6.75,6.75,0,.41406-.33594.75-.75.75Z",
  pin:"M14.30664,8.09277l-2.39941-2.39941.62695-2.93848.79785-.79785c.29297-.29297.29297-.76758,0-1.06055s-.76855-.29297-1.06152,0l-.79785.79785-2.93848.62695-2.39941-2.39941c-.29297-.29297-.76758-.29297-1.06055,0s-.29297.76758,0,1.06055l2.39941,2.39941-.62695,2.93848-.79785.79785c-.29297.29297-.29297.76855,0,1.06152.14648.14648.33887.21973.53027.21973s.38379-.07324.53027-.21973l.79785-.79785,2.93848-.62695,2.39941,2.39941c.14648.14648.33887.21973.53027.21973s.38379-.07324.53027-.21973c.29297-.29297.29297-.76758,0-1.06055Z",
  trash:"m16.5,4h-3.25v-.75c0-1.24023-1.00977-2.25-2.25-2.25h-2c-1.24023,0-2.25,1.00977-2.25,2.25v.75h-3.25c-.41406,0-.75.33594-.75.75s.33594.75.75.75h.55273l.71875,11.27246c.07227,1.18164,1.05566,2.10645,2.23926,2.10645h6.47852c1.18359,0,2.16699-.9248,2.23926-2.10547l.71875-11.27344h.55273c.41406,0,.75-.33594.75-.75s-.33594-.75-.75-.75Zm-10.5-.75c0-.41309.33691-.75.75-.75h2c.41309,0,.75.33691.75.75v.75h-3.5v-.75Zm8.17773,13.42285c-.02441.39355-.35254.70215-.74707.70215h-6.47852c-.39453,0-.72266-.30859-.74707-.70312l-.71094-11.17188h10.10254l-.71094,11.17285Z",
  refresh:"m17.24268,9.24927c-.39111.03051-.69287.36963-.69287.76172v.0083c-.00488.07568-.0625,1.00342-.51123,1.97852-.61475,1.33545-1.65967,2.18994-3.19531,2.61279-.16553.04565-.33203.06641-.49805.06641h-2.34521v-1.31836c0-.30371-.18311-.57764-.46436-.69385-.28076-.11621-.60449-.05225-.81982.16309l-3.24561,3.24561c-.29297.29297-.29297.76807,0,1.06104l3.24561,3.24561c.14648.14648.33887.21973.53027.21973.0957,0,.19238-.0083.28955-.05566.28125-.11621.46436-.39014.46436-.69385v-1.31836h2.34521c.31201,0,.62354-.03906.92627-.12354,4.5249-1.26025,4.93945-5.61768,4.95605-5.80273.00146-.01807.00244-.03613.00244-.05469v-.01807c0-.45264-.39111-.81104-.84473-.76123Zm-4.42041-2.4585h2.34521v1.31836c0,.30371.18311.57764.46436.69385.09717.04736.19385.05566.28955.05566.19141,0,.38379-.07324.53027-.21973l3.24561-3.24561c.29297-.29297.29297-.76807,0-1.06104l-3.24561-3.24561c-.21533-.21533-.53906-.2793-.81982-.16309-.28125.11621-.46436.39014-.46436.69385v1.31836h-2.34521c-.31201,0-.62354.03906-.92627.12354C7.36719,1.5354,6.95264,5.89282,6.93604,6.07788c-.00146.01807-.00244.03613-.00244.05469v.01807c0,.45264.39111.81104.84473.76123.39111-.03051.69287-.36963.69287-.76172v-.0083c.00488-.07568.0625-1.00342.51123-1.97852.61475-1.33545,1.65967-2.18994,3.19531-2.61279.16553-.04565.33203-.06641.49805-.06641Z"
};
function buildSprite(){
  const defs = document.getElementById('sprite');
  for (const [k,d] of Object.entries(ICONS)){
    const sym = document.createElementNS('http://www.w3.org/2000/svg','symbol');
    sym.id = 'i-'+k; sym.setAttribute('viewBox','0 0 20 20');
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', d); sym.appendChild(p); defs.appendChild(sym);
  }
}
const $ = (id) => document.getElementById(id);
function iconSvg(name, cls=''){ return `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`; }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

/* ---------- State ---------- */
let MODE = 'live';                 // 'live' | 'demo'
let system = null, tasks = [], projects = [], keepalive = { available:false, services:{} };
let view = 'category', filter = 'all';
const homeTilde = (p) => String(p||'').replace(/^\/Users\/[^/]+/, '~');

const STATUS = {
  run:{label:'运行中',cls:'run'}, ok:{label:'正常',cls:'ok'},
  warn:{label:'需关注',cls:'warn'}, err:{label:'异常',cls:'err'}, idle:{label:'已停用',cls:'idle'}
};

/* ---------- Demo snapshot (mirrors data/*.json + keepalive sample) ---------- */
function demoData(){
  const now = Math.floor(Date.now()/1000);
  return {
    system:{ port:4321, runningCount:0, taskCount:2, enabledCount:1, projectCount:6 },
    tasks:[
      { id:'demo-autophone', name:'继续未完成', projectId:'p-autophone', projectName:'autophone',
        cwd:'/Users/kolar/github/autophone', resolvedCwd:'/Users/kolar/github/autophone',
        prompt:'继续未完成的计划',
        commandTemplate:'claude --print "$TASK_PROMPT" --permission-mode auto',
        authCheckEnabled:true, authCheckCommand:'claude auth status', authLoginCommand:'claude', authTimeoutSeconds:300,
        enabled:true, maxRuntimeMinutes:90, running:false,
        schedule:{type:'once',runAt:'2026-06-01T16:42:00.000Z'},
        lastStatus:'success', lastRunAt:'2026-06-01T16:42:11.176Z', lastLog:'2026-06-01T16-42-11-176Z--.log', nextRunAt:null },
      { id:'demo-pidata', name:'继续M3-M6', projectId:'p-pidata', projectName:'pi-data',
        cwd:'/Users/kolar/github/pi-data', resolvedCwd:'/Users/kolar/github/pi-data',
        prompt:'继续后面的几个阶段，完成一个后提交再进行下一个。\nM5 Web 双轴前端未做。\nM6 P0.5 工具未完整暴露：画像读取、DQ、静态 Join、冷表 profiling。\nM7 P1 执行器未做：test_join、dry_run、MySQL/StarRocks 活查执行器。',
        commandTemplate:'claude --print "$TASK_PROMPT" --permission-mode acceptEdits',
        authCheckEnabled:true, authCheckCommand:'claude auth status', authLoginCommand:'claude', authTimeoutSeconds:300,
        enabled:false, maxRuntimeMinutes:90, running:false,
        schedule:{type:'once',runAt:'2026-06-01T17:15:00.000Z'},
        lastStatus:'success', lastRunAt:'2026-06-02T03:09:15.407Z', lastLog:'2026-06-02T03-09-15-407Z--M3-M6.log', nextRunAt:null }
    ],
    projects:[
      { id:'p-home', name:'home', path:'/Users/kolar', notes:'Imported from Claude trusted projects', pinned:true },
      { id:'p-datage', name:'data_ge_new', path:'/Users/kolar/github/data_ge_new', notes:'Imported from Claude trusted projects', pinned:true },
      { id:'p-linear', name:'linear-manage', path:'/Users/kolar/github/linear-manage', notes:'Imported from Claude trusted projects', pinned:true },
      { id:'p-multica', name:'multica', path:'/Users/kolar/github/multica', notes:'', pinned:true },
      { id:'p-pidata', name:'pi-data', path:'/Users/kolar/github/pi-data', notes:'', pinned:true },
      { id:'p-autophone', name:'autophone', path:'/Users/kolar/github/autophone', notes:'', pinned:true }
    ],
    keepalive:{ available:true, logFile:'~/.local/var/log/keepalive-cc-codex.log',
      services:{
        claude:{ status:'err', exitCode:1, variant:'haiku', note:'403 Request not allowed', nextEpoch: now + 28*60 },
        codex:{ status:'warn', exitCode:124, variant:'gpt-5.4, low effort', note:'间歇 websocket 重连', nextEpoch: now + 52*60 }
      }}
  };
}

/* ---------- API ---------- */
async function getJSON(url){
  const r = await fetch(url, { headers:{accept:'application/json'} });
  if (!r.ok) throw new Error(url+' '+r.status);
  return r.json();
}

async function load(){
  try{
    const [sys, t, p, k] = await Promise.all([
      getJSON('/api/system'), getJSON('/api/tasks'), getJSON('/api/projects'), getJSON('/api/keepalive')
    ]);
    system = sys; tasks = t.tasks || []; projects = p.projects || []; keepalive = k || keepalive;
    MODE = 'live';
  }catch(e){
    const d = demoData();
    system = d.system; tasks = d.tasks; projects = d.projects; keepalive = d.keepalive;
    MODE = 'demo';
  }
  renderAll();
}

/* ---------- Status mapping ---------- */
function taskStatus(t){
  if (t.running) return {status:'run',label:'运行中'};
  if (!t.enabled) return {status:'idle',label:'已停用'};
  const m = { success:{status:'ok',label:'上次成功'}, failed:{status:'err',label:'上次失败'},
              auth_failed:{status:'warn',label:'登录失败'}, never:{status:'ok',label:'待运行'} };
  return m[t.lastStatus] || {status:'ok',label:t.lastStatus||'待运行'};
}
function scheduleText(s){
  if (!s || s.type==='manual') return '仅手动';
  if (s.type==='once') return '一次性 · '+(s.runAt? new Date(s.runAt).toLocaleString('zh-CN'):'未设定');
  if (s.type==='daily') return '每天 '+((s.times||[]).join(', ')||'未设定');
  if (s.type==='weekly') return '每周 '+((s.days||[]).join('/'))+' · '+((s.times||[]).join(', '));
  if (s.type==='interval') return '每 '+(s.minutes||'?')+' 分钟';
  return s.type;
}

/* ---------- Countdown ---------- */
function countdownText(epochSec){
  let diff = Math.round(epochSec - Date.now()/1000);
  if (diff<=0) return {txt:'已到期',cls:'over'};
  const h=Math.floor(diff/3600), m=Math.floor((diff%3600)/60), s=diff%60;
  const cls = diff<1800?'soon':'';
  if (h>0) return {txt:`${h}h ${String(m).padStart(2,'0')}m`,cls};
  return {txt:`${m}m ${String(s).padStart(2,'0')}s`,cls};
}
function cdSpan(epochSec){
  const c = countdownText(epochSec);
  return `<span class="v countdown ${c.cls}" data-cd="${epochSec}">${c.txt}</span>`;
}

/* ---------- Card markup ---------- */
function metaRows(rows){
  return rows.filter(Boolean).map(([k,v])=>`<div class="mrow"><span class="k">${k}</span>${v}</div>`).join('');
}
function valText(v, code){ return `<span class="v${code?' code':''}">${esc(v)}</span>`; }

function cardShell({id, status, glyph, title, sub, badge, sw, meta, detail, busy}){
  const st = STATUS[status] || STATUS.idle;
  const gInner = glyph.mono ? esc(glyph.mono) : iconSvg(glyph.icon);
  return `<article class="card${busy?' busy':''}" data-id="${id}" data-status="${status}">
    <div class="card-main" data-toggle>
      <div class="row1">
        <div class="glyph${glyph.mono?' mono':''}" style="background:${glyph.bg}">${gInner}</div>
        <div class="titlewrap">
          <div class="t">${esc(title)}</div>
          ${sub?`<div class="s">${esc(sub)}</div>`:''}
        </div>
        <span class="badge ${st.cls}"><span class="dot ${st.cls}"></span>${esc(badge||st.label)}</span>
        ${sw||''}
      </div>
      ${meta?`<div class="meta">${meta}</div>`:''}
    </div>
    ${detail?`<div class="detail"><div class="detail-in">${detail}</div></div>`:''}
  </article>`;
}
function detailBlock({desc, kv, note, code, codeLabel, codeDark, actions}){
  const kvHtml = kv && kv.length ? `<div><div class="dlabel">详情</div><dl class="kv">${kv.filter(Boolean).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : '';
  const noteHtml = note ? `<div class="mrow" style="color:var(--orange-900);align-items:flex-start">${iconSvg('bell')}<span class="v" style="white-space:normal">${esc(note)}</span></div>` : '';
  const codeHtml = code ? `<div><div class="dlabel">${esc(codeLabel||'命令')}</div><div class="codeblock${codeDark?' dark':''}">${esc(code)}</div></div>` : '';
  const actHtml = actions && actions.length ? `<div class="dactions">${actions.map(a=>`<button class="mini ${a.danger?'danger':''}" data-act="${a.act}" data-arg="${esc(a.arg||'')}">${iconSvg(a.icon)}${esc(a.label)}</button>`).join('')}</div>` : '';
  return `${desc?`<p style="margin:0;font-size:12.5px;color:var(--body);line-height:1.55">${esc(desc)}</p>`:''}${kvHtml}${noteHtml}${codeHtml}${actHtml}`;
}

/* ----- column builders ----- */
function toolsCards(){
  const ka = keepalive.services || {};
  const kaWorst = ['err','warn','ok'].find(s => ka.claude?.status===s || ka.codex?.status===s) || 'idle';
  const runnerUp = MODE==='live';
  return [
    cardShell({
      id:'tool-runner', status: runnerUp?'run':'warn',
      glyph:{icon:'send', bg:'linear-gradient(135deg,#1473e6,#0d66d0)'},
      title:'Claude Task Runner', sub:`localhost:${system?.port||4321} · LaunchAgent`,
      badge: runnerUp?'运行中':'离线',
      meta: metaRows([
        ['类型', valText('Web 配置 + 调度')],
        ['任务', valText(`${system?.taskCount??tasks.length} 个 · ${system?.enabledCount??tasks.filter(t=>t.enabled).length} 启用`)],
        ['运行中', valText(`${system?.runningCount??tasks.filter(t=>t.running).length} 个任务`)]
      ]),
      detail: detailBlock({
        desc:'人离开电脑时按配置触发 Claude Code 或其他编程命令。常驻为当前用户的 macOS LaunchAgent，睡眠期间不跑，唤醒后补跑到期日程。',
        kv:[['端口', system?.port||4321],['常驻','com.kolar LaunchAgent'],['配置','data/projects.json · tasks.json'],['日志','logs/'],['触发','手动 / 一次性 / 每日 / 每周 / 间隔']],
        code:'claude --print "$TASK_PROMPT" --permission-mode acceptEdits', codeLabel:'默认命令模板',
        actions:[{act:'copy',arg:'npm start',icon:'copy',label:'复制启动命令'},{act:'copy',arg:'npm run install-daemon',icon:'copy',label:'复制常驻命令'}]
      })
    }),
    cardShell({
      id:'tool-keepalive', status: kaWorst,
      glyph:{icon:'bell', bg:'linear-gradient(135deg,#da7b11,#bd5b00)'},
      title:'keepalive-cc-codex', sub:'LaunchAgent · 保活进程',
      badge: kaWorst==='err'?'需关注':(kaWorst==='warn'?'间歇':'运行中'),
      meta: metaRows([
        ['类型', valText('用量窗口保活')],
        ['Claude', valText(ka.claude?.note || (ka.claude?.status==='ok'?'正常':'—'))],
        ['Codex', valText(ka.codex?.note || (ka.codex?.status==='ok'?'正常':'—'))]
      ]),
      detail: detailBlock({
        desc:'长驻 launchd 后台进程，独立检查 Claude 与 Codex，再睡到下一个到期服务。成功 ping 等 5h1m；瞬时失败 30 分钟后重试。',
        kv:[['脚本','~/.local/bin/keepalive-cc-codex.sh'],['日志', keepalive.logFile||'~/.local/var/log/keepalive-cc-codex.log'],['成功间隔','18060s (5h1m)'],['重试','30 分钟']],
        code:'launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist 2>/dev/null || true\nlaunchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist',
        codeLabel:'重载 LaunchAgent', codeDark:true,
        actions:[{act:'kalog',icon:'download',label:'查看保活日志'},{act:'copy',arg:'launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist 2>/dev/null || true\nlaunchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist',icon:'copy',label:'复制重载命令'}]
      })
    })
  ];
}

function taskCard(t){
  const ts = taskStatus(t);
  const bg = ts.status==='idle' ? 'linear-gradient(135deg,#9f9f9f,#818181)'
           : ts.status==='err' ? 'linear-gradient(135deg,#d7373f,#c9252d)'
           : 'linear-gradient(135deg,#2680eb,#1473e6)';
  const sw = `<button class="switch" role="switch" aria-checked="${!!t.enabled}" title="启用/停用" data-switch></button>`;
  const last = t.lastRunAt ? new Date(t.lastRunAt).toLocaleString('zh-CN') : '从未运行';
  return cardShell({
    id:t.id, status:ts.status, busy:t.running,
    glyph:{icon:'send', bg},
    title:t.name, sub: homeTilde(t.resolvedCwd||t.cwd),
    badge:ts.label, sw,
    meta: metaRows([
      ['项目', valText(t.projectName||'未绑定')],
      ['触发', valText(scheduleText(t.schedule))],
      t.nextRunAt ? ['下次', cdSpan(Math.floor(new Date(t.nextRunAt).getTime()/1000))] : ['上次', valText(`${t.lastStatus||'never'} · ${last}`)]
    ]),
    detail: detailBlock({
      kv:[
        ['命令模板', t.commandTemplate],
        ['运行路径', t.resolvedCwd||t.cwd],
        t.projectName?null:['备用路径', t.cwd],
        ['登录检查', t.authCheckEnabled? (t.authCheckCommand||'claude auth status') : '关闭'],
        ['最长运行', (t.maxRuntimeMinutes||90)+' 分钟'],
        ['上次运行', last],
        ['上次结果', t.lastStatus||'never']
      ],
      code: t.prompt, codeLabel:'任务 Prompt',
      actions:[
        {act:'run',icon:'play',label:'立即运行'},
        {act:'edit',icon:'edit',label:'编辑'},
        t.lastLog?{act:'log',arg:t.lastLog,icon:'download',label:'查看日志'}:null,
        {act:'del-task',icon:'trash',label:'删除',danger:true}
      ].filter(Boolean)
    })
  });
}

function projectCard(p){
  const linked = tasks.filter(t=>t.projectId===p.id).map(t=>t.name);
  const palette = ['#3c3c3c,#222','#2d9d78,#12805c','#6767ec,#4b4bd6','#d83790,#c038cc','#2680eb,#0d66d0','#da7b11,#bd5b00'];
  const bg = 'linear-gradient(135deg,'+palette[(p.name||'').length % palette.length]+')';
  return cardShell({
    id:p.id, status:'ok',
    glyph:{icon: p.path==='/Users/kolar'?'home':'folder', bg},
    title:p.name, sub: homeTilde(p.path),
    badge: p.pinned?'常用':'项目',
    meta: metaRows([
      ['路径', valText(homeTilde(p.path), true)],
      linked.length?['关联', valText(linked.join('、'))]:['备注', valText(p.notes||'—')]
    ]),
    detail: detailBlock({
      desc: p.notes||'',
      kv:[['完整路径', p.path],['固定', p.pinned?'常用项目':'否'], linked.length?['关联任务', linked.join('、')]:null],
      actions:[
        {act:'use-project',icon:'add',label:'用于新任务'},
        {act:'edit-project',icon:'edit',label:'编辑'},
        {act:'pin-project',icon:'pin',label:p.pinned?'取消常用':'固定常用'},
        {act:'del-project',icon:'trash',label:'删除',danger:true}
      ]
    })
  });
}

function keepaliveCard(name, label, sub, svc, bg){
  const status = svc?.status || 'idle';
  const badgeMap = {ok:'正常',warn:'间歇',err:'受阻',idle:'无数据'};
  return cardShell({
    id:'ka-'+name, status,
    glyph:{mono: name==='claude'?'CC':'cx', bg},
    title:label, sub,
    badge: svc?.note ? (svc.note.length>10?badgeMap[status]:svc.note) : badgeMap[status],
    meta: metaRows([
      ['最近', valText(svc?.note || (svc?.exitCode!=null?`exit=${svc.exitCode}`:'—'))],
      svc?.variant?['模式', valText(svc.variant)]:null,
      svc?.nextEpoch?['下次', cdSpan(svc.nextEpoch)]:['下次', valText('—')]
    ]),
    detail: detailBlock({
      desc: name==='claude'
        ? '普通终端 claude -p 可成功，但 launchd/背景执行可能返回 403。state 文件与 Codex 独立。'
        : 'launchd 下整体可成功；偶发 websocket 重连失败时 30 分钟后重试。',
      kv:[
        ['上次结果', svc?.exitCode!=null?`exit=${svc.exitCode}`:'—'],
        svc?.note?['说明', svc.note]:null,
        ['退避', status==='ok'?'5h1m':'30 分钟重试']
      ],
      code: name==='claude'?'claude setup-token':'launchctl print gui/$(id -u)/com.kolar.keepalive-cc-codex',
      codeLabel: name==='claude'?'修复建议':'查看状态',
      actions:[
        {act:'kalog',icon:'download',label:'查看日志'},
        name==='claude'?{act:'copy',arg:'claude setup-token',icon:'copy',label:'复制修复命令'}:null
      ].filter(Boolean)
    })
  });
}

/* ---------- Board render ---------- */
const COLUMNS = [
  {id:'tools', name:'编程工具', icon:'settings', color:'#3c3c3c'},
  {id:'tasks', name:'定时任务', icon:'send', color:'#1473e6'},
  {id:'keepalive', name:'保活服务', icon:'bell', color:'#bd5b00'},
  {id:'projects', name:'本地项目', icon:'folder', color:'#12805c'}
];
// settings icon path (board head) reuse refresh-ish; map to existing
ICONS.settings = ICONS.refresh;

function columnCards(colId){
  if (colId==='tools') return toolsCards();
  if (colId==='tasks') return tasks.map(taskCard);
  if (colId==='keepalive') return [
    keepaliveCard('claude','Claude','claude (haiku) · launchd', keepalive.services?.claude, 'linear-gradient(135deg,#d7373f,#c9252d)'),
    keepaliveCard('codex','Codex','codex (gpt-5.4, low) · launchd', keepalive.services?.codex, 'linear-gradient(135deg,#2d9d78,#12805c)')
  ];
  if (colId==='projects') return projects.map(projectCard);
  return [];
}
function cardStatusOf(html){ const m = html.match(/data-status="([^"]+)"/); return m?m[1]:'idle'; }

function renderBoard(){
  const board = $('board');
  let cols;
  if (view==='category'){
    cols = COLUMNS.map(c => ({...c, cards: columnCards(c.id), addable: c.id==='tasks'||c.id==='projects', addLabel: c.id==='tasks'?'新建任务':'新建项目'}));
  } else {
    const order=[['run','运行中','#2680eb','send'],['err','异常','#c9252d','bell'],['warn','需关注','#da7b11','bell'],['ok','正常','#12805c','folder'],['idle','已停用','#9f9f9f','settings']];
    const all = COLUMNS.flatMap(c=>columnCards(c.id));
    cols = order.map(([sid,name,color,icon])=>({id:sid,name,color,icon,cards: all.filter(h=>cardStatusOf(h)===sid)})).filter(c=>c.cards.length);
  }
  board.innerHTML = cols.map(col=>{
    const cards = col.cards.map(h=>{
      const dim = (filter!=='all' && cardStatusOf(h)!==filter) ? ' dim':'';
      return dim ? h.replace('class="card', 'class="card'+dim) : h;
    }).join('');
    const add = (view==='category' && col.addable) ? `<button class="add-card" data-add="${col.id}">${iconSvg('add')}${col.addLabel}</button>` : '';
    const body = cards || (view==='category' ? '' : '') ;
    return `<section class="col">
      <div class="col-head">
        <div class="ci" style="background:${col.color}">${iconSvg(col.icon)}</div>
        <h2>${col.name}</h2>
        <span class="count">${col.cards.length}</span>
      </div>
      <div class="col-body">
        ${body || `<div class="empty">暂无${col.name}</div>`}
        ${add}
      </div>
    </section>`;
  }).join('');
  bindCards();
}

function renderStats(){
  const all = [...tasks.map(t=>taskStatus(t).status)];
  if (keepalive.services){ ['claude','codex'].forEach(s=>{ if(keepalive.services[s]) all.push(keepalive.services[s].status); }); }
  const n = (s)=>all.filter(x=>x===s).length;
  const items=[
    ['run','run', tasks.filter(t=>t.running).length, ' 运行'],
    ['err','err', n('err'), ' 异常'],
    ['warn','warn', n('warn'), ' 关注'],
    ['idle','idle', projects.length, ' 项目']
  ];
  $('stats').innerHTML = items.map(([k,dot,num,lab])=>`<span class="stat"><span class="dot ${dot}"></span><b>${num}</b>${lab}</span>`).join('');
  const mode = $('mode');
  mode.className = 'mode '+(MODE==='live'?'live':'demo');
  mode.innerHTML = `<span class="dot ${MODE==='live'?'ok':'warn'}"></span>${MODE==='live'?'实时':'演示数据'}`;
}

function renderFilters(){
  const opts=[['all','全部','idle'],['run','运行中','run'],['err','异常','err'],['warn','需关注','warn'],['idle','已停用','idle']];
  $('filters').innerHTML = opts.map(([id,lab,dot])=>`<button class="chip" data-filter="${id}" aria-pressed="${filter===id}">${id!=='all'?`<span class="dot ${dot}"></span>`:''}${lab}</button>`).join('');
}
function renderAll(){ renderStats(); renderFilters(); renderBoard(); }

/* ---------- Toast ---------- */
function toast(msg, kind=''){
  const el = document.createElement('div');
  el.className = 'toast '+(kind||'');
  el.innerHTML = (kind==='err'?'':`<span class="dot ok"></span>`)+esc(msg);
  $('toasts').appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 2200);
}
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); toast('已复制到剪贴板'); }
  catch{ toast('复制失败，请手动选择', 'err'); }
}

/* ---------- Card interactions ---------- */
function bindCards(){
  document.querySelectorAll('[data-toggle]').forEach(el=>el.addEventListener('click', e=>{
    if (e.target.closest('[data-switch]') || e.target.closest('[data-act]')) return;
    el.closest('.card').classList.toggle('open');
  }));
  document.querySelectorAll('[data-switch]').forEach(sw=>sw.addEventListener('click', async e=>{
    e.stopPropagation();
    const id = sw.closest('.card').dataset.id;
    await toggleTask(id);
  }));
  document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click', ()=>{
    const which = b.dataset.add;
    if (which==='tasks') openTaskDrawer();
    else openProjectDrawer();
  }));
  document.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click', e=>{
    e.stopPropagation();
    const card = b.closest('.card'); const id = card?.dataset.id;
    const act = b.dataset.act, arg = b.dataset.arg;
    handleAction(act, id, arg, b);
  }));
}

function handleAction(act, id, arg, btn){
  switch(act){
    case 'copy': return copyText(arg);
    case 'run': return runTask(id);
    case 'edit': return openTaskDrawer(id);
    case 'del-task': return deleteTask(id);
    case 'log': return openLog(arg, 'task');
    case 'kalog': return openLog(null, 'keepalive');
    case 'use-project': { const p=projects.find(x=>x.id===id); openTaskDrawer(null, p?.id); return; }
    case 'edit-project': return openProjectDrawer(id);
    case 'pin-project': return pinProject(id);
    case 'del-project': return deleteProject(id);
  }
}

/* ---------- Task ops ---------- */
async function toggleTask(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  if (MODE==='demo'){ t.enabled=!t.enabled; renderAll(); toast(t.enabled?'已启用（演示）':'已停用（演示）'); return; }
  await fetch(`/api/tasks/${id}`, {method:'PUT', headers:{'content-type':'application/json'}, body:JSON.stringify({...t, enabled:!t.enabled})});
  toast(t.enabled?'已停用':'已启用'); load();
}
async function runTask(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  if (MODE==='demo'){ t.running=true; renderAll(); toast('开始运行（演示）');
    setTimeout(()=>{ t.running=false; t.lastStatus='success'; t.lastRunAt=new Date().toISOString(); renderAll(); toast('运行完成（演示）'); }, 2200); return; }
  await fetch(`/api/tasks/${id}/run`, {method:'POST'});
  toast('已触发运行'); setTimeout(load, 700);
}
async function deleteTask(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  if (!confirm(`删除任务「${t.name}」？`)) return;
  if (MODE==='demo'){ tasks=tasks.filter(x=>x.id!==id); renderAll(); toast('已删除（演示）'); return; }
  await fetch(`/api/tasks/${id}`, {method:'DELETE'}); toast('任务已删除'); load();
}

/* ---------- Project ops ---------- */
async function pinProject(id){
  const p = projects.find(x=>x.id===id); if(!p) return;
  if (MODE==='demo'){ p.pinned=!p.pinned; renderAll(); toast(p.pinned?'已固定（演示）':'已取消（演示）'); return; }
  await fetch(`/api/projects/${id}/pin`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({pinned:!p.pinned})});
  toast(p.pinned?'已取消常用':'已固定常用'); load();
}
async function deleteProject(id){
  const p = projects.find(x=>x.id===id); if(!p) return;
  if (!confirm(`删除项目「${p.name}」？绑定它的任务会变成手动路径。`)) return;
  if (MODE==='demo'){ projects=projects.filter(x=>x.id!==id); tasks.forEach(t=>{ if(t.projectId===id){t.projectId='';t.projectName='';} }); renderAll(); toast('已删除（演示）'); return; }
  await fetch(`/api/projects/${id}`, {method:'DELETE'}); toast('项目已删除'); load();
}

/* ---------- Drawer ---------- */
function openDrawer(){ $('scrim').classList.add('show'); $('drawer').classList.add('show'); $('drawer').setAttribute('aria-hidden','false'); }
function closeDrawer(){ $('scrim').classList.remove('show'); $('drawer').classList.remove('show'); $('drawer').setAttribute('aria-hidden','true'); }

function projectOptions(selected){
  const pinned = projects.filter(p=>p.pinned), other = projects.filter(p=>!p.pinned);
  const opt = (arr)=>arr.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${p.pinned?'★ ':''}${esc(p.name)} — ${esc(homeTilde(p.path))}</option>`).join('');
  return `<option value="">不绑定项目，手动填写路径</option>`+
    (pinned.length?`<optgroup label="常用项目">${opt(pinned)}</optgroup>`:'')+
    (other.length?`<optgroup label="其他项目">${opt(other)}</optgroup>`:'');
}
function scheduleEditor(type, s={}){
  const toLocal = (v)=>{ if(!v) return ''; const d=new Date(v); if(isNaN(d)) return ''; const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  if (type==='once') return `<div class="field"><label for="f-runAt">运行时间</label><input class="input" id="f-runAt" type="datetime-local" value="${toLocal(s.runAt)}" /></div>`;
  if (type==='daily') return `<div class="field"><label for="f-dailyTimes">每天时间（逗号分隔）</label><input class="input code" id="f-dailyTimes" placeholder="09:00, 13:30, 23:15" value="${esc((s.times||[]).join(', '))}" /></div>`;
  if (type==='weekly') return `<div class="field"><label for="f-weeklyDays">星期（0=周日, 逗号分隔）</label><input class="input code" id="f-weeklyDays" placeholder="1, 3, 5" value="${esc((s.days||[]).join(', '))}" /></div><div class="field"><label for="f-weeklyTimes">当天时间（逗号分隔）</label><input class="input code" id="f-weeklyTimes" placeholder="10:00, 18:00" value="${esc((s.times||[]).join(', '))}" /></div>`;
  if (type==='interval') return `<div class="field"><label for="f-intervalMinutes">间隔分钟</label><input class="input" id="f-intervalMinutes" type="number" min="1" value="${s.minutes||300}" /></div>`;
  return '';
}
function renderScheduleFields(s){ $('f-schedule-fields').innerHTML = scheduleEditor($('f-scheduleType').value, s||{}); }

function openTaskDrawer(id, presetProjectId){
  const t = id ? tasks.find(x=>x.id===id) : null;
  const s = t?.schedule || {type:'manual'};
  const projId = presetProjectId ?? (t?.projectId||'');
  const presetPath = projId ? (projects.find(p=>p.id===projId)?.path||'') : (t?.cwd||'');
  $('drawerTitle').textContent = t ? '编辑任务' : '新建任务';
  $('drawerBody').innerHTML = `
    <input type="hidden" id="f-task-id" value="${t?.id||''}" />
    <div class="field"><label for="f-name">任务名称</label><input class="input" id="f-name" placeholder="夜间继续未完成" value="${esc(t?.name||'')}" /></div>
    <div class="field"><label for="f-project">绑定项目</label><select class="select" id="f-project">${projectOptions(projId)}</select><span class="hint">绑定后运行时动态使用项目当前路径</span></div>
    <div class="field"><label for="f-cwd">仓库路径（未绑定项目时使用）</label><input class="input code" id="f-cwd" placeholder="/Users/kolar/github/project" value="${esc(presetPath)}" /></div>
    <div class="field"><label for="f-prompt">任务 Prompt</label><textarea class="textarea" id="f-prompt" placeholder="继续未完成的计划…">${esc(t?.prompt||'')}</textarea></div>
    <div class="field"><label for="f-cmd">命令模板</label><input class="input code" id="f-cmd" value='${esc(t?.commandTemplate||'claude --print "$TASK_PROMPT" --permission-mode acceptEdits')}' /></div>
    <label class="checkrow"><input type="checkbox" id="f-authCheck" ${t?.authCheckEnabled!==false?'checked':''} />启动前检查 Claude 登录状态</label>
    <div class="field-row">
      <div class="field"><label for="f-authCmd">登录检查命令</label><input class="input code" id="f-authCmd" value="${esc(t?.authCheckCommand||'claude auth status')}" /></div>
      <div class="field"><label for="f-authTimeout">登录步骤超时(秒)</label><input class="input" id="f-authTimeout" type="number" min="5" value="${t?.authTimeoutSeconds||300}" /></div>
    </div>
    <div class="field"><label for="f-authLogin">未登录时执行一次</label><input class="input code" id="f-authLogin" value="${esc(t?.authLoginCommand||'claude')}" /></div>
    <div class="field-row">
      <div class="field"><label for="f-scheduleType">触发方式</label><select class="select" id="f-scheduleType">
        ${[['manual','仅手动'],['once','一次性'],['daily','每天指定时间'],['weekly','每周指定时间'],['interval','间隔触发']].map(([v,l])=>`<option value="${v}" ${s.type===v?'selected':''}>${l}</option>`).join('')}
      </select></div>
      <div class="field"><label for="f-maxRuntime">最长运行(分钟)</label><input class="input" id="f-maxRuntime" type="number" min="1" value="${t?.maxRuntimeMinutes||90}" /></div>
    </div>
    <div id="f-schedule-fields"></div>
    <label class="checkrow"><input type="checkbox" id="f-enabled" ${t?.enabled!==false?'checked':''} />启用自动触发</label>
  `;
  $('drawerFoot').innerHTML = `<button class="btn" id="drawerCancel">取消</button><button class="btn primary" id="drawerSave"><svg class="icon"><use href="#i-add"/></svg>保存任务</button>`;
  renderScheduleFields(s);
  $('f-scheduleType').addEventListener('change', ()=>renderScheduleFields({type:$('f-scheduleType').value}));
  $('f-project').addEventListener('change', ()=>{ const p=projects.find(x=>x.id===$('f-project').value); if(p) $('f-cwd').value=p.path; });
  $('drawerCancel').addEventListener('click', closeDrawer);
  $('drawerSave').addEventListener('click', saveTask);
  openDrawer();
  setTimeout(()=>$('f-name').focus(), 260);
}

function readSchedule(){
  const type = $('f-scheduleType').value;
  const list = (v)=>v.split(',').map(x=>x.trim()).filter(Boolean);
  if (type==='once') return {type, runAt: $('f-runAt').value? new Date($('f-runAt').value).toISOString():null};
  if (type==='daily') return {type, times:list($('f-dailyTimes').value)};
  if (type==='weekly') return {type, days:list($('f-weeklyDays').value).map(Number), times:list($('f-weeklyTimes').value)};
  if (type==='interval') return {type, minutes:Number($('f-intervalMinutes').value||300)};
  return {type:'manual'};
}
async function saveTask(){
  const id = $('f-task-id').value;
  const name = $('f-name').value.trim();
  if (!name){ toast('请填写任务名称','err'); $('f-name').focus(); return; }
  const payload = {
    name, projectId:$('f-project').value, cwd:$('f-cwd').value.trim(), prompt:$('f-prompt').value.trim(),
    commandTemplate:$('f-cmd').value.trim(), authCheckEnabled:$('f-authCheck').checked,
    authCheckCommand:$('f-authCmd').value.trim(), authLoginCommand:$('f-authLogin').value.trim(),
    authTimeoutSeconds:Number($('f-authTimeout').value||300), enabled:$('f-enabled').checked,
    maxRuntimeMinutes:Number($('f-maxRuntime').value||90), schedule:readSchedule()
  };
  if (MODE==='demo'){
    const proj = projects.find(p=>p.id===payload.projectId);
    if (id){ const i=tasks.findIndex(t=>t.id===id); tasks[i]={...tasks[i],...payload, projectName:proj?.name||'', resolvedCwd:proj?.path||payload.cwd}; }
    else tasks.push({id:'demo-'+Date.now(), ...payload, projectName:proj?.name||'', resolvedCwd:proj?.path||payload.cwd, running:false, lastStatus:'never', lastRunAt:null, nextRunAt:null});
    closeDrawer(); renderAll(); toast(id?'已保存（演示）':'已创建（演示）'); return;
  }
  await fetch(id?`/api/tasks/${id}`:'/api/tasks', {method:id?'PUT':'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)});
  closeDrawer(); toast(id?'任务已保存':'任务已创建'); load();
}

function openProjectDrawer(id){
  const p = id ? projects.find(x=>x.id===id) : null;
  $('drawerTitle').textContent = p ? '编辑项目' : '新建项目';
  $('drawerBody').innerHTML = `
    <input type="hidden" id="f-proj-id" value="${p?.id||''}" />
    <div class="field"><label for="f-pname">项目名称</label><input class="input" id="f-pname" placeholder="my-repo" value="${esc(p?.name||'')}" /></div>
    <div class="field"><label for="f-ppath">项目地址</label><input class="input code" id="f-ppath" placeholder="/Users/kolar/github/my-repo" value="${esc(p?.path||'')}" /></div>
    <div class="field"><label for="f-pnotes">备注</label><input class="input" id="f-pnotes" placeholder="可选，例如主分支 / 用途" value="${esc(p?.notes||'')}" /></div>
    <label class="checkrow"><input type="checkbox" id="f-ppinned" ${p?.pinned?'checked':''} />固定为常用项目</label>
  `;
  $('drawerFoot').innerHTML = `<button class="btn" id="drawerCancel">取消</button><button class="btn primary" id="drawerSave"><svg class="icon"><use href="#i-add"/></svg>保存项目</button>`;
  $('drawerCancel').addEventListener('click', closeDrawer);
  $('drawerSave').addEventListener('click', saveProject);
  openDrawer();
  setTimeout(()=>$('f-pname').focus(), 260);
}
async function saveProject(){
  const id = $('f-proj-id').value;
  const name = $('f-pname').value.trim(), path = $('f-ppath').value.trim();
  if (!name || !path){ toast('请填写名称与地址','err'); return; }
  const payload = { name, path, notes:$('f-pnotes').value.trim(), pinned:$('f-ppinned').checked };
  if (MODE==='demo'){
    if (id){ const i=projects.findIndex(p=>p.id===id); projects[i]={...projects[i],...payload}; }
    else projects.push({id:'demo-p-'+Date.now(), ...payload});
    closeDrawer(); renderAll(); toast(id?'已保存（演示）':'已创建（演示）'); return;
  }
  await fetch(id?`/api/projects/${id}`:'/api/projects', {method:id?'PUT':'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)});
  closeDrawer(); toast(id?'项目已保存':'项目已创建'); load();
}

/* ---------- Log modal ---------- */
async function openLog(file, kind){
  $('logModal').classList.add('show');
  $('logBody').textContent = '加载中…';
  if (kind==='keepalive'){
    $('logTitle').textContent = 'keepalive-cc-codex.log';
    if (MODE==='demo'){ $('logBody').textContent = DEMO_KA_LOG; return; }
    try{ $('logBody').textContent = await fetch('/api/keepalive/log').then(r=>r.text()); }
    catch{ $('logBody').textContent = '无法读取保活日志。'; }
    return;
  }
  $('logTitle').textContent = file || '日志';
  if (MODE==='demo'){ $('logBody').textContent = DEMO_TASK_LOG; return; }
  try{ $('logBody').textContent = await fetch('/api/logs/'+encodeURIComponent(file)).then(r=>r.text()); }
  catch{ $('logBody').textContent = '无法读取日志文件。'; }
}
function closeLog(){ $('logModal').classList.remove('show'); }

const DEMO_TASK_LOG = `[2026-06-01T16:42:11Z] task=继续未完成
[2026-06-01T16:42:11Z] cwd=/Users/kolar/github/autophone
[2026-06-01T16:42:11Z] reason=scheduled
[2026-06-01T16:42:11Z] command=claude --print "$TASK_PROMPT" --permission-mode auto

继续未完成的计划…
已读取项目状态，定位到未完成的待办项。
[完成] 提交改动并总结。

[2026-06-01T16:47:47Z] exit code=0 signal=
（演示数据 · 实际部署时显示真实日志）`;

const DEMO_KA_LOG = `=== 2026-06-02 10:24:17 keepalive start ===
--- claude (haiku) ---
path: claude -> /Users/kolar/.local/bin/claude
Failed to authenticate. API Error: 403 Request not allowed
[claude (haiku) exit=1 elapsed=7s]
next: 2026-06-02 10:54:24 after transient failure
--- codex (gpt-5.4, low effort) ---
skip: next attempt at 2026-06-02 10:34:32
=== 2026-06-02 10:24:24 keepalive done ===
（演示数据 · 实际部署时读取 ~/.local/var/log/keepalive-cc-codex.log）`;

/* ---------- Toolbar ---------- */
function bindToolbar(){
  document.querySelectorAll('.seg').forEach(s=>s.addEventListener('click', ()=>{
    view = s.dataset.view;
    document.querySelectorAll('.seg').forEach(x=>x.setAttribute('aria-pressed', x===s));
    renderBoard();
  }));
  $('filters').addEventListener('click', e=>{
    const c = e.target.closest('[data-filter]'); if(!c) return;
    filter = c.dataset.filter; renderFilters(); renderBoard();
  });
  $('addTaskBtn').addEventListener('click', ()=>openTaskDrawer());
  $('syncBtn').addEventListener('click', e=>{ const b=e.currentTarget; b.disabled=true; load().then(()=>{ b.disabled=false; toast(MODE==='live'?'已同步':'离线 · 演示数据'); }); });
  $('scrim').addEventListener('click', closeDrawer);
  $('drawerClose').addEventListener('click', closeDrawer);
  $('logClose').addEventListener('click', closeLog);
  $('logModal').addEventListener('click', e=>{ if(e.target===$('logModal')) closeLog(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeDrawer(); closeLog(); } });
}

/* ---------- Clock + countdown tick ---------- */
function tick(){
  const d = new Date(), p = n=>String(n).padStart(2,'0');
  $('clock').textContent = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  document.querySelectorAll('[data-cd]').forEach(el=>{ const c=countdownText(+el.dataset.cd); el.textContent=c.txt; el.className='v countdown '+c.cls; });
}

/* ---------- Boot ---------- */
buildSprite();
bindToolbar();
load();
tick(); setInterval(tick, 1000);
setInterval(()=>{ if(MODE==='live' && !$('drawer').classList.contains('show')) load(); }, 12000);
