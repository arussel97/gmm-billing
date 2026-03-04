/* ══════════════════════════════════════════════════════
   GMM Billing Solutions — Assessment Portal
   app.js  |  All application logic
   ══════════════════════════════════════════════════════ */

// ════════════════════════════════
// CONSTANTS & STATE
// ════════════════════════════════
const TEAMS_DEFAULT = ['Charges Team','Payment Team','Analyst Team','Coding Team','AR Team','Management','Operations'];

// Google Apps Script Web App URL — set via Settings tab or edit here directly
let GAS_URL = localStorage.getItem('gmm_gas_url') || '';

let currentUser = null;
let assessments  = [];
let currentAID   = null;
let empAnswers   = {};
let lockedQs     = {};
let allResults   = [];

// ════════════════════════════════
// INIT
// ════════════════════════════════
(function init(){
  try { assessments = JSON.parse(localStorage.getItem('gmm_assessments') || '[]'); } catch(e){ assessments = []; }

  // Restore GAS URL in settings input if available
  const gasInp = document.getElementById('gas-inp');
  if(gasInp && GAS_URL) gasInp.value = GAS_URL;

  // Enter key on login fields
  ['li-email','li-pass'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
  });

  // Explanation textarea toggle in builder
  document.addEventListener('change', e => {
    if(e.target.id === 'f-exp') document.getElementById('s-exp').classList.toggle('hidden', !e.target.checked);
  });

  // Close modals on overlay click
  document.querySelectorAll('.movl').forEach(ov => {
    ov.addEventListener('click', e => { if(e.target === ov) ov.classList.remove('open'); });
  });

  // Seed demo assessments if none exist
  seedDemoAssessments();
})();

// ════════════════════════════════
// GOOGLE APPS SCRIPT API BRIDGE
// Uses JSONP — bypasses CORS completely
// ════════════════════════════════
function gasCall(data) {
  return new Promise((resolve, reject) => {
    if(!GAS_URL) { reject(new Error('No Apps Script URL configured')); return; }

    const cbName = '_gmm_cb_' + Date.now() + '_' + Math.floor(Math.random()*9999);
    const url = GAS_URL
      + '?callback=' + encodeURIComponent(cbName)
      + '&payload='  + encodeURIComponent(JSON.stringify(data))
      + '&action='   + encodeURIComponent(data.action || '');

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out after 10s'));
    }, 10000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      const s = document.getElementById(cbName);
      if(s) s.remove();
    }

    window[cbName] = (result) => { cleanup(); resolve(result); };

    const script = document.createElement('script');
    script.id  = cbName;
    script.src = url;
    script.onerror = () => { cleanup(); reject(new Error('Script load failed — check your Apps Script URL')); };
    document.head.appendChild(script);
  });
}

async function gasCallSafe(data) {
  return gasCall(data);
}

// ════════════════════════════════
// GAS SETTINGS (Settings tab)
// ════════════════════════════════
function saveGAS() {
  const v = document.getElementById('gas-inp').value.trim();
  if(!v){ toast('Enter a valid URL','err'); return; }
  if(!v.includes('script.google.com')){ toast('Must be a Google Apps Script URL','err'); return; }
  GAS_URL = v;
  localStorage.setItem('gmm_gas_url', v);
  document.getElementById('gas-status').textContent = '✓ URL saved';
  toast('✓ Apps Script URL saved!','ok');
}

async function testGAS() {
  const v = document.getElementById('gas-inp').value.trim() || GAS_URL;
  if(!v){ toast('No URL configured','err'); return; }
  const btn = document.getElementById('test-gas-btn');
  btn.textContent = 'Testing…'; btn.disabled = true;
  try {
    const r = await fetch(v, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action:'ping'}), redirect:'follow' });
    const txt = await r.text();
    const d = JSON.parse(txt.replace(/^[\w]+\(/,'').replace(/\);\s*$/,'').trim());
    if(d && d.success){ toast('✅ Connected to Google Sheets!','ok'); document.getElementById('gas-status').textContent = '✓ Connection successful'; }
    else { toast('⚠ Script responded: '+(d.message||'Unknown'),'err'); }
  } catch(e) {
    toast('❌ Failed: '+e.message,'err');
    document.getElementById('gas-status').textContent = '✗ ' + e.message;
  }
  btn.textContent = '🔌 Test Connection'; btn.disabled = false;
}

function saveDefaults() {
  const p = document.getElementById('def-pass').value;
  const e = document.getElementById('def-email').value.trim();
  if(p) localStorage.setItem('gmm_def_pass', p);
  if(e) localStorage.setItem('gmm_def_email', e);
  toast('✓ Defaults saved','ok');
}

// ════════════════════════════════
// LOGIN / LOGOUT
// ════════════════════════════════
async function doLogin() {
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value.trim();
  if(!email || !pass){ showErr('Please enter your email and password.'); return; }

  const btn = document.getElementById('signin-btn');
  const txt = document.getElementById('signin-txt');
  btn.disabled = true;
  txt.innerHTML = '<span class="spin"></span> Signing in…';
  const resetBtn = () => { btn.disabled = false; txt.textContent = 'Sign In →'; };

  let user = null;

  if(GAS_URL) {
    try {
      const r = await gasCallSafe({ action: 'login', email, password: pass });
      if(r && r.success) {
        user = r.user;
      } else {
        resetBtn();
        showErr(r && r.message ? r.message : 'Invalid email or password.');
        return;
      }
    } catch(e) {
      // GAS unreachable — fall back to demo credentials
      user = demoLogin(email, pass);
    }
  } else {
    user = demoLogin(email, pass);
  }

  resetBtn();

  if(!user) {
    showErr('Invalid email or password. Please try again.');
    return;
  }

  hideErr();
  currentUser = user;
  afterLogin();
}

function demoLogin(email, pass) {
  const demos = [
    { email:'admin@gmmbilling.com',   password:'Admin@123',  name:'Admin User',   role:'admin',    department:'Management',   employeeId:'ADM-001' },
    { email:'charges@gmmbilling.com', password:'Charges@1',  name:'Alex Johnson', role:'employee', department:'Charges Team', employeeId:'EMP-001' },
    { email:'payment@gmmbilling.com', password:'Payment@1',  name:'Sarah Lee',    role:'employee', department:'Payment Team', employeeId:'EMP-002' },
    { email:'analyst@gmmbilling.com', password:'Analyst@1',  name:'Raj Patel',    role:'employee', department:'Analyst Team', employeeId:'EMP-003' },
  ];
  return demos.find(d => d.email.toLowerCase() === email.toLowerCase() && d.password === pass) || null;
}

function afterLogin() {
  document.getElementById('pg-login').style.display = 'none';
  if(currentUser.role === 'admin') {
    document.getElementById('pg-admin').classList.add('active');
    document.getElementById('adm-nm').textContent = currentUser.name;
    document.getElementById('adm-av').textContent = currentUser.name[0].toUpperCase();
    // Restore GAS URL in settings
    const gasInp = document.getElementById('gas-inp');
    if(gasInp && GAS_URL) gasInp.value = GAS_URL;
    const dp = localStorage.getItem('gmm_def_pass');
    const de = localStorage.getItem('gmm_def_email');
    if(dp) document.getElementById('def-pass').value = dp;
    if(de) document.getElementById('def-email').value = de;
    renderAssessmentsList();
    populateBuilderSelect();
    populateResultsFilter();
  } else {
    document.getElementById('pg-employee').classList.add('active');
    document.getElementById('emp-nm').textContent = currentUser.name;
    document.getElementById('emp-av').textContent = currentUser.name[0].toUpperCase();
    loadEmployeeView();
  }
}

function doLogout() {
  currentUser = null; empAnswers = {}; lockedQs = {};
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('pg-completed').classList.remove('show');
  document.getElementById('pg-login').style.display = 'flex';
  document.getElementById('li-email').value = '';
  document.getElementById('li-pass').value = '';
}

function showErr(m){ const e = document.getElementById('lerr'); e.classList.add('show'); document.getElementById('lerr-msg').textContent = m; }
function hideErr(){ document.getElementById('lerr').classList.remove('show'); }
function toggleEye(){ const i = document.getElementById('li-pass'); i.type = i.type === 'password' ? 'text' : 'password'; }

// ════════════════════════════════
// ADMIN TABS
// ════════════════════════════════
function swTab(id, btn) {
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.tpane').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('tp-'+id).classList.add('on');
  if(id === 'assessments') renderAssessmentsList();
}

// ════════════════════════════════
// ASSESSMENTS LIST
// ════════════════════════════════
function renderAssessmentsList() {
  const el = document.getElementById('assessments-list');
  if(!assessments.length) {
    el.innerHTML = '<div class="empty"><div class="ei">📋</div><p>No assessments yet. Click "＋ New Assessment" to create one.</p></div>';
    return;
  }
  el.innerHTML = assessments.map(a => {
    const teams = a.teams || [];
    const qcount = (a.questions || []).length;
    const published = a.published;
    return `
    <div class="acard" onclick="openEditModal('${a.id}')">
      <div class="acard-icon">${getAIcon(a.title)}</div>
      <div class="acard-body">
        <div class="acard-title">${a.title}</div>
        <div class="acard-meta">
          <span class="chip ch-blue">${qcount} Question${qcount !== 1 ? 's' : ''}</span>
          <span class="chip ch-gold">Pass: ${a.passingScore}%</span>
          <span class="chip ${published ? 'ch-green' : 'ch-gray'}">${published ? '✓ Published' : 'Draft'}</span>
        </div>
        <div class="acard-teams">
          ${teams.length ? '🏢 '+teams.join(' · ') : '<span style="color:var(--g500)">No teams assigned yet</span>'}
        </div>
      </div>
      <div class="acard-actions" onclick="event.stopPropagation()">
        <button class="btn b-blue b-sm" onclick="togglePublish('${a.id}')">${published ? 'Unpublish' : 'Publish'}</button>
        <button class="btn b-red b-sm" onclick="deleteAssessment('${a.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function getAIcon(title) {
  const t = (title||'').toLowerCase();
  if(t.includes('charge')) return '💰';
  if(t.includes('payment')) return '💳';
  if(t.includes('analyst')||t.includes('analysis')) return '📊';
  if(t.includes('coding')||t.includes('code')) return '🔤';
  if(t.includes('ar')||t.includes('account')) return '📁';
  return '📋';
}

// ════════════════════════════════
// NEW ASSESSMENT MODAL
// ════════════════════════════════
function openNewAssessmentModal() {
  document.getElementById('na-title').value = '';
  document.getElementById('na-desc').value = '';
  document.getElementById('na-pass').value = localStorage.getItem('gmm_def_pass') || 70;
  document.getElementById('na-email').value = localStorage.getItem('gmm_def_email') || '';
  renderTeamCheckboxes('team-checkboxes', []);
  openModal('modal-new-assessment');
}

function renderTeamCheckboxes(containerId, selected) {
  const allTeams = new Set([...TEAMS_DEFAULT]);
  assessments.forEach(a => (a.teams||[]).forEach(t => allTeams.add(t)));
  const el = document.getElementById(containerId);
  el.innerHTML = [...allTeams].map(t => `
    <label class="team-cb ${selected.includes(t) ? 'on' : ''}">
      <input type="checkbox" value="${t}" ${selected.includes(t) ? 'checked' : ''} onchange="this.closest('.team-cb').classList.toggle('on',this.checked)"/>
      ${t}
    </label>`).join('');
}

function getCheckedTeams(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`)].map(c => c.value);
}

function addCustomTeam() {
  const inp = document.getElementById('new-team-inp');
  const v = inp.value.trim(); if(!v) return;
  const el = document.getElementById('team-checkboxes');
  const div = document.createElement('label'); div.className = 'team-cb on';
  div.innerHTML = `<input type="checkbox" value="${v}" checked onchange="this.closest('.team-cb').classList.toggle('on',this.checked)"/>${v}`;
  el.appendChild(div); inp.value = '';
}

function addEditCustomTeam() {
  const inp = document.getElementById('edit-new-team-inp');
  const v = inp.value.trim(); if(!v) return;
  const el = document.getElementById('edit-team-checkboxes');
  const div = document.createElement('label'); div.className = 'team-cb on';
  div.innerHTML = `<input type="checkbox" value="${v}" checked onchange="this.closest('.team-cb').classList.toggle('on',this.checked)"/>${v}`;
  el.appendChild(div); inp.value = '';
}

function createAssessment() {
  const title = document.getElementById('na-title').value.trim();
  if(!title){ toast('Enter an assessment title','err'); return; }
  const a = {
    id: 'a_'+Date.now(),
    title,
    desc: document.getElementById('na-desc').value.trim(),
    passingScore: parseInt(document.getElementById('na-pass').value) || 70,
    mgmtEmail: document.getElementById('na-email').value.trim(),
    teams: getCheckedTeams('team-checkboxes'),
    questions: [],
    published: false,
    createdAt: new Date().toISOString()
  };
  assessments.push(a);
  saveAssessments();
  closeModal('modal-new-assessment');
  renderAssessmentsList();
  populateBuilderSelect();
  populateResultsFilter();
  toast(`✓ "${title}" created`,'ok');
}

// ════════════════════════════════
// EDIT ASSESSMENT MODAL
// ════════════════════════════════
function openEditModal(aid) {
  const a = assessments.find(x => x.id === aid); if(!a) return;
  document.getElementById('edit-aid').value = aid;
  document.getElementById('edit-modal-title').textContent = 'Edit: '+a.title;
  document.getElementById('edit-title').value = a.title;
  document.getElementById('edit-desc').value = a.desc || '';
  document.getElementById('edit-pass').value = a.passingScore || 70;
  document.getElementById('edit-email').value = a.mgmtEmail || '';
  renderTeamCheckboxes('edit-team-checkboxes', a.teams || []);
  openModal('modal-edit-assessment');
}

function saveEditAssessment() {
  const aid = document.getElementById('edit-aid').value;
  const a = assessments.find(x => x.id === aid); if(!a) return;
  const title = document.getElementById('edit-title').value.trim();
  if(!title){ toast('Title required','err'); return; }
  a.title = title;
  a.desc = document.getElementById('edit-desc').value.trim();
  a.passingScore = parseInt(document.getElementById('edit-pass').value) || 70;
  a.mgmtEmail = document.getElementById('edit-email').value.trim();
  a.teams = getCheckedTeams('edit-team-checkboxes');
  saveAssessments();
  closeModal('modal-edit-assessment');
  renderAssessmentsList();
  populateBuilderSelect();
  populateResultsFilter();
  toast('✓ Assessment updated','ok');
}

function togglePublish(aid) {
  const a = assessments.find(x => x.id === aid); if(!a) return;
  if(!a.published && !a.questions.length){ toast('Add questions before publishing','err'); return; }
  if(!a.published && !a.teams.length){ toast('Assign at least one team before publishing','err'); return; }
  a.published = !a.published;
  saveAssessments();
  renderAssessmentsList();
  toast(a.published ? `✓ "${a.title}" is now live` : `"${a.title}" unpublished`,'ok');
}

function deleteAssessment(aid) {
  assessments = assessments.filter(a => a.id !== aid);
  saveAssessments();
  renderAssessmentsList();
  populateBuilderSelect();
  populateResultsFilter();
  if(currentAID === aid){ currentAID = null; renderQList(); }
  toast('Assessment deleted','ok');
}

// ════════════════════════════════
// BUILDER — ASSESSMENT SELECTOR
// ════════════════════════════════
function populateBuilderSelect() {
  const sel = document.getElementById('builder-assessment-sel');
  sel.innerHTML = '<option value="">-- Select Assessment --</option>';
  assessments.forEach(a => {
    const o = document.createElement('option'); o.value = a.id; o.textContent = a.title;
    if(a.id === currentAID) o.selected = true;
    sel.appendChild(o);
  });
}

function switchBuilderAssessment() {
  currentAID = document.getElementById('builder-assessment-sel').value || null;
  const a = currentAID ? assessments.find(x => x.id === currentAID) : null;
  document.getElementById('builder-for-label').textContent = a ? `Building: ${a.title}` : 'Select an assessment first';
  renderQList();
}

// ════════════════════════════════
// QUESTION BUILDER
// ════════════════════════════════
let qType = 'mcq', tfSel = null, ynSel = null;

function setQT(t, btn) {
  qType = t;
  document.querySelectorAll('.qpill').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('s-mcq').classList.toggle('hidden', !['mcq','multi'].includes(t));
  document.getElementById('s-tf').classList.toggle('hidden', t !== 'tf');
  document.getElementById('s-yn').classList.toggle('hidden', t !== 'yn');
  document.getElementById('s-text').classList.toggle('hidden', t !== 'text');
}

function markC(btn) {
  const isMulti = qType === 'multi';
  if(!isMulti) { document.querySelectorAll('#choices-wrap .mc-btn').forEach(b => b.classList.remove('on')); }
  btn.classList.toggle('on');
}

function addOpt() {
  const wrap = document.getElementById('choices-wrap');
  const idx = wrap.children.length;
  const labs = 'ABCDEFGHIJ';
  const row = document.createElement('div'); row.className = 'crow';
  row.innerHTML = `<button class="mc-btn" onclick="markC(this)">✓</button><input class="cinp" placeholder="Option ${labs[idx] || idx+1}"/><button class="rmbtn" onclick="rmC(this)">×</button>`;
  wrap.appendChild(row);
}

function rmC(btn) {
  const row = btn.closest('.crow');
  if(document.getElementById('choices-wrap').children.length > 2) row.remove();
  else toast('Need at least 2 options','err');
}

function pickTF(v) {
  tfSel = v;
  document.getElementById('tf-t').classList.toggle('sel', v === 'True');
  document.getElementById('tf-f').classList.toggle('sel', v === 'False');
}

function pickYN(v) {
  ynSel = v;
  document.getElementById('yn-y').classList.toggle('sel', v === 'Yes');
  document.getElementById('yn-n').classList.toggle('sel', v === 'No');
}

function addQ() {
  if(!currentAID){ toast('Select an assessment first','err'); return; }
  const a = assessments.find(x => x.id === currentAID);
  const text = document.getElementById('q-text').value.trim();
  if(!text){ toast('Enter question text','err'); return; }

  const q = {
    id: Date.now(),
    text,
    type: qType,
    mandatory: document.getElementById('f-mand').checked,
    points: parseInt(document.getElementById('f-pts').value) || 1,
    explanation: document.getElementById('f-exp').checked ? document.getElementById('exp-txt').value.trim() : '',
    options: [],
    correctAnswers: [],
    correctAnswer: null
  };

  if(['mcq','multi'].includes(qType)) {
    const rows = document.querySelectorAll('#choices-wrap .crow');
    rows.forEach((row, i) => {
      const val = row.querySelector('.cinp').value.trim();
      if(val) {
        q.options.push(val);
        if(row.querySelector('.mc-btn').classList.contains('on')) q.correctAnswers.push(q.options.length - 1);
      }
    });
    if(q.options.length < 2){ toast('Add at least 2 options','err'); return; }
    if(!q.correctAnswers.length){ toast('Mark at least one correct answer','err'); return; }
  } else if(qType === 'tf') {
    if(!tfSel){ toast('Select correct answer (True/False)','err'); return; }
    q.options = ['True','False'];
    q.correctAnswer = tfSel;
  } else if(qType === 'yn') {
    if(!ynSel){ toast('Select correct answer (Yes/No)','err'); return; }
    q.options = ['Yes','No'];
    q.correctAnswer = ynSel;
  } else {
    const key = document.getElementById('text-key').value.trim();
    q.correctAnswer = key;
  }

  a.questions.push(q);
  saveAssessments();
  renderQList();
  clearB();
  toast('✓ Question added','ok');
}

function clearB() {
  document.getElementById('q-text').value = '';
  document.getElementById('f-pts').value = 1;
  document.getElementById('f-mand').checked = false;
  document.getElementById('f-exp').checked = false;
  document.getElementById('exp-txt').value = '';
  document.getElementById('s-exp').classList.add('hidden');
  document.getElementById('text-key').value = '';
  tfSel = null; ynSel = null;
  document.querySelectorAll('#choices-wrap .mc-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('tf-t').classList.remove('sel');
  document.getElementById('tf-f').classList.remove('sel');
  document.getElementById('yn-y').classList.remove('sel');
  document.getElementById('yn-n').classList.remove('sel');
}

function renderQList() {
  const el = document.getElementById('q-list');
  const lbl = document.getElementById('q-count-lbl');
  const a = currentAID ? assessments.find(x => x.id === currentAID) : null;
  const qs = a ? a.questions : [];
  lbl.textContent = qs.length + ' question' + (qs.length !== 1 ? 's' : '');
  if(!qs.length) {
    el.innerHTML = '<div class="empty"><div class="ei">❓</div><p>No questions yet.</p></div>';
    return;
  }
  const typeLabels = { mcq:'MCQ', multi:'Multi-Select', tf:'True/False', yn:'Yes/No', text:'Short Answer' };
  el.innerHTML = qs.map((q, i) => `
    <div class="qi">
      <div class="qnum">Q${i+1}</div>
      <div class="qbody">
        <div class="qtxt">${q.text}${q.mandatory?'<span class="mstar">*</span>':''}</div>
        <div class="qchips">
          <span class="chip ch-blue">${typeLabels[q.type]||q.type}</span>
          <span class="chip ch-gold">${q.points}pt${q.points>1?'s':''}</span>
          ${q.explanation ? '<span class="chip ch-green">Explanation</span>' : ''}
        </div>
      </div>
      <button class="qdel" onclick="deleteQ('${a.id}',${i})" title="Delete question">×</button>
    </div>`).join('');
}

function deleteQ(aid, idx) {
  const a = assessments.find(x => x.id === aid); if(!a) return;
  a.questions.splice(idx, 1);
  saveAssessments();
  renderQList();
  toast('Question removed','ok');
}

// ════════════════════════════════
// RESULTS FILTER
// ════════════════════════════════
function populateResultsFilter() {
  const sel = document.getElementById('res-filter-assessment');
  sel.innerHTML = '<option value="">All Assessments</option>';
  assessments.forEach(a => {
    const o = document.createElement('option'); o.value = a.id; o.textContent = a.title;
    sel.appendChild(o);
  });
}

// ════════════════════════════════
// ADMIN RESULTS
// ════════════════════════════════
async function loadResults() {
  const el = document.getElementById('results-area');
  if(!GAS_URL) {
    el.innerHTML = '<div class="empty"><div class="ei">🔗</div><p>Configure your Google Apps Script URL in the Settings tab first.</p></div>';
    return;
  }
  el.innerHTML = '<div class="empty"><div class="ei"><span class="spin"></span></div><p>Loading results…</p></div>';
  try {
    const res = await gasCallSafe({ action: 'getResults' });
    allResults = res.results || [];
    renderResultsTable(allResults);
  } catch(e) {
    el.innerHTML = '<div class="empty"><div class="ei">⚠</div><p>Failed to load results. Check your Apps Script URL in Settings.</p></div>';
  }
}

function filterResults() {
  const aid = document.getElementById('res-filter-assessment').value;
  const a = aid ? assessments.find(x => x.id === aid) : null;
  const filtered = a ? allResults.filter(r => r.assessmentTitle === a.title) : allResults;
  renderResultsTable(filtered);
}

function renderResultsTable(data) {
  const el = document.getElementById('results-area');
  if(!data.length) {
    el.innerHTML = '<div class="empty"><div class="ei">📊</div><p>No results yet.</p></div>';
    return;
  }
  el.innerHTML = `<div class="rtw"><table class="rt">
    <thead><tr>
      <th>Employee</th><th>Dept</th><th>Assessment</th>
      <th>Score</th><th>Result</th><th>Correct</th><th>Submitted</th>
    </tr></thead>
    <tbody>${data.map(r => `<tr>
      <td><div style="font-weight:600">${r.employeeName||'—'}</div><div style="font-size:11px;color:var(--g500)">${r.employeeEmail||''}</div></td>
      <td style="color:var(--g300)">${r.department||'—'}</td>
      <td>${r.assessmentTitle||'—'}</td>
      <td><strong style="color:var(--blue-lt);font-size:15px">${r.score||0}%</strong></td>
      <td><span class="pb ${r.passed==='Pass'?'p':'f'}">${r.passed||'—'}</span></td>
      <td>${r.correct||0} / ${(parseInt(r.correct)||0)+(parseInt(r.wrong)||0)+(parseInt(r.skipped)||0)}</td>
      <td style="color:var(--g500);font-size:11px">${r.submittedAt||'—'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

// ════════════════════════════════
// PERSIST (localStorage)
// ════════════════════════════════
function saveAssessments() {
  try { localStorage.setItem('gmm_assessments', JSON.stringify(assessments)); } catch(e){}
}

// ════════════════════════════════
// EMPLOYEE VIEW
// ════════════════════════════════
function loadEmployeeView() {
  const area = document.getElementById('emp-quiz-area');
  const dept  = (currentUser.department || '').trim();
  const email = currentUser.email;

  const assigned = assessments.filter(a =>
    a.published &&
    (a.teams||[]).some(t => t.toLowerCase() === dept.toLowerCase())
  );

  if(!assigned.length) {
    area.innerHTML = `<div class="not-assigned"><div class="icon">🔒</div><h2>No Assessment Assigned</h2><p>You don't have any assessments assigned to your team (<strong>${dept}</strong>) at this time. Please check back later or contact your administrator.</p></div>`;
    return;
  }

  const completedKey = aid => `gmm_done_${email}_${aid}`;
  const todo = assigned.filter(a => !localStorage.getItem(completedKey(a.id)));

  if(!todo.length) {
    area.innerHTML = `<div class="already-done"><div class="icon">✅</div><h2>Assessment Already Completed</h2><p>You have already completed all your assigned assessments. Each assessment can only be taken once. Please contact your administrator if you have any questions.</p><div style="margin-top:28px;"><button class="btn b-ghost" onclick="doLogout()">Exit</button></div></div>`;
    return;
  }

  startQuiz(todo[0]);
}

function startQuiz(a) {
  empAnswers = {}; lockedQs = {};
  const area = document.getElementById('emp-quiz-area');
  const total = a.questions.reduce((s, q) => s + q.points, 0);
  const labs = 'ABCDEFGH';
  const hints = {
    mcq: 'Choose one answer',
    multi: 'Select all that apply',
    tf: 'True or False — cannot change once selected',
    yn: 'Yes or No — cannot change once selected',
    text: 'Type your answer'
  };

  area.innerHTML = `
    <div class="qhd">
      <h1>${a.title}</h1>
      <p style="color:var(--g300);font-size:13px;">${a.desc || 'Read each question carefully and answer.'}</p>
      <div class="qmeta">
        <div class="qmi">📋 ${a.questions.length} Questions</div>
        <div class="qmi">🏅 ${total} Points</div>
        <div class="qmi">✅ Pass: ${a.passingScore}%</div>
        <div class="qmi" style="color:#ff8080;">🔒 One attempt only</div>
      </div>
    </div>
    <div class="pbar"><div class="pfill" id="ep-prog" style="width:0%"></div></div>
    <div id="eq-qs"></div>
    <div class="subbox">
      <h3>Submit Assessment</h3>
      <p>Once submitted, your results will be sent to the manager. This action cannot be undone.</p>
      <div class="cpl-row">
        <span style="font-size:12px;color:var(--g300);">Answered:</span>
        <div class="cpl-bar"><div class="cpl-fill" id="ep-cfill" style="width:0%"></div></div>
        <span class="cpl-lbl" id="ep-clbl">0 / ${a.questions.length}</span>
      </div>
      <button class="btn b-gold b-full" style="font-size:15px;padding:15px;" onclick="submitEmp('${a.id}')">
        📤 Submit &amp; Send Results to Manager
      </button>
    </div>`;

  const qContainer = document.getElementById('eq-qs');
  qContainer.innerHTML = a.questions.map((q, qi) => {
    let opts = '';
    if(['mcq','multi'].includes(q.type)) {
      opts = `<div class="opts">${q.options.map((o, oi) => `
        <button class="opt" id="op-${qi}-${oi}" onclick="pick(${qi},${oi},'${q.type}','${a.id}')">
          <div class="odot">${labs[oi]||oi}</div>${o}
        </button>`).join('')}</div>`;
    } else if(q.type === 'tf' || q.type === 'yn') {
      const o = q.type === 'tf' ? ['True','False'] : ['Yes','No'];
      const ic = q.type === 'tf' ? ['T','F'] : ['Y','N'];
      opts = `<div class="tf-row">${o.map((v, oi) => `
        <button class="opt" id="op-${qi}-${oi}" onclick="pick(${qi},${oi},'single','${a.id}')">
          <div class="odot">${ic[oi]}</div>${v}
        </button>`).join('')}</div>`;
    } else {
      opts = `<textarea class="tans" id="ta-${qi}" placeholder="Type your answer here…" oninput="pickText(${qi},this.value,'${a.id}')"></textarea>`;
    }
    return `<div class="qcard" id="qc-${qi}">
      <div class="qctop">
        <div class="qnb">Q${qi+1} · ${q.points}pt${q.points>1?'s':''}</div>
        <div class="qqtxt">${q.text}${q.mandatory?'<span class="mstar">*</span>':''}</div>
      </div>
      <div class="qhint">${hints[q.type]||''}</div>
      ${opts}
    </div>`;
  }).join('');
}

// ── Answer picking ──
function pick(qi, oi, type, aid) {
  if(lockedQs[qi]){ toast('Answer already locked — cannot change','err'); return; }
  if(!empAnswers[qi]) empAnswers[qi] = [];

  if(type === 'multi') {
    const x = empAnswers[qi].indexOf(oi);
    if(x > -1) empAnswers[qi].splice(x, 1); else empAnswers[qi].push(oi);
  } else {
    empAnswers[qi] = [oi];
    lockedQs[qi] = true;
    const a = assessments.find(x => x.id === aid);
    if(a) {
      (a.questions[qi].options||[]).forEach((_, i) => {
        const b = document.getElementById(`op-${qi}-${i}`);
        if(b){ b.classList.add('locked'); b.title = 'Answer locked'; }
      });
    }
  }

  const a = assessments.find(x => x.id === aid);
  if(a) (a.questions[qi].options||[]).forEach((_, i) => {
    const b = document.getElementById(`op-${qi}-${i}`);
    if(b) b.classList.toggle('sel', empAnswers[qi].includes(i));
  });

  document.getElementById(`qc-${qi}`)?.classList.toggle('done', empAnswers[qi].length > 0);
  updateProg(aid);
}

function pickText(qi, v, aid) {
  empAnswers[qi] = v.trim() ? [v.trim()] : [];
  document.getElementById(`qc-${qi}`)?.classList.toggle('done', v.trim().length > 0);
  updateProg(aid);
}

function updateProg(aid) {
  const a = assessments.find(x => x.id === aid); if(!a) return;
  const tot = a.questions.length;
  const ans = Object.keys(empAnswers).filter(k => empAnswers[k] && empAnswers[k].length > 0).length;
  const p = tot ? (ans / tot) * 100 : 0;
  const prog = document.getElementById('ep-prog'); if(prog) prog.style.width = p+'%';
  const fill = document.getElementById('ep-cfill'); if(fill) fill.style.width = p+'%';
  const lbl  = document.getElementById('ep-clbl');  if(lbl)  lbl.textContent = `${ans} / ${tot}`;
}

// ════════════════════════════════
// SUBMIT ASSESSMENT
// ════════════════════════════════
async function submitEmp(aid) {
  const a = assessments.find(x => x.id === aid); if(!a) return;
  const qs = a.questions;
  const mandMissing = qs.filter((q, i) => q.mandatory && (!empAnswers[i] || !empAnswers[i].length));
  if(mandMissing.length){ toast(`⚠ Answer all mandatory (*) questions — ${mandMissing.length} remaining`,'err'); return; }

  const subBtn = document.querySelector('.subbox .btn');
  if(subBtn){ subBtn.disabled = true; subBtn.innerHTML = '<span class="spin"></span> Submitting…'; }

  let earned = 0, total = 0, correct = 0, wrong = 0, skipped = 0;
  qs.forEach((q, qi) => {
    total += q.points;
    const ans = empAnswers[qi] || [];
    const has = ans.length > 0;
    let ok = false;
    if(['mcq','multi'].includes(q.type)) {
      ok = has && [...ans].sort().join() === ([...q.correctAnswers]).sort().join();
    } else if(q.type === 'tf' || q.type === 'yn') {
      const opts = q.type === 'tf' ? ['True','False'] : ['Yes','No'];
      ok = has && opts[ans[0]] === q.correctAnswer;
    } else {
      ok = has && (q.correctAnswer ? (ans[0]||'').toLowerCase().includes(q.correctAnswer.toLowerCase()) : has);
    }
    if(!has) skipped++; else if(ok){ correct++; earned += q.points; } else wrong++;
  });

  const pct    = total ? Math.round((earned / total) * 100) : 0;
  const passed = pct >= a.passingScore;

  const payload = {
    action: 'saveResult',
    employeeName: currentUser.name,
    employeeEmail: currentUser.email,
    employeeId: currentUser.employeeId || '',
    department: currentUser.department || '',
    assessmentId: a.id,
    assessmentTitle: a.title,
    score: pct,
    earnedPoints: earned,
    totalPoints: total,
    passed: passed ? 'Pass' : 'Fail',
    correct, wrong, skipped,
    submittedAt: new Date().toLocaleString(),
    mgmtEmail: a.mgmtEmail || ''
  };

  // Send to Google Sheets via Apps Script
  if(GAS_URL) {
    try { await gasCallSafe(payload); }
    catch(e) { console.warn('GAS save failed:', e.message); }
  }

  // Mark completed locally so they can't retake
  localStorage.setItem(`gmm_done_${currentUser.email}_${a.id}`, JSON.stringify({
    pct, passed, submittedAt: new Date().toISOString()
  }));

  showCompletedScreen(passed);
}

function showCompletedScreen(passed) {
  document.getElementById('pg-employee').classList.remove('active');
  document.getElementById('comp-sub-txt').textContent =
    'Your responses have been recorded and your results have been sent to the manager. Thank you for participating!';
  document.getElementById('pg-completed').classList.add('show');
}

// ════════════════════════════════
// MODAL / TOAST UTILS
// ════════════════════════════════
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  document.getElementById('t-msg').textContent = msg;
  document.getElementById('t-ico').textContent  = type === 'ok' ? '✓' : '⚠';
  el.className = `toast ${type} show`;
  clearTimeout(window._tt);
  window._tt = setTimeout(() => el.className = `toast ${type}`, 3500);
}

// ════════════════════════════════
// SEED DEMO ASSESSMENTS
// ════════════════════════════════
function seedDemoAssessments() {
  if(assessments.length) return;
  assessments = [
    {
      id:'a_demo1', title:'Charges Team — Medical Billing Fundamentals',
      desc:'Test your knowledge of charge entry, CPT codes, and billing workflows.',
      passingScore:70, mgmtEmail:'manager@gmmbilling.com', teams:['Charges Team'],
      published:true, createdAt:new Date().toISOString(),
      questions:[
        { id:1,text:'What does CPT stand for?',type:'mcq',mandatory:true,points:2,
          explanation:'CPT = Current Procedural Terminology',
          options:['Current Patient Treatment','Current Procedural Terminology','Certified Payment Terms','Clinical Processing Tools'],
          correctAnswers:[1],correctAnswer:null },
        { id:2,text:'Which form is used for professional/outpatient billing?',type:'mcq',mandatory:true,points:2,
          explanation:'CMS-1500 is the standard professional claim form.',
          options:['UB-04','CMS-1450','CMS-1500','ADA Form'],
          correctAnswers:[2],correctAnswer:null },
        { id:3,text:'A charge entry must be completed within 24 hours of the patient visit.',type:'tf',mandatory:false,points:1,
          explanation:'Timely charge entry is critical to revenue cycle.',
          options:['True','False'],correctAnswers:[],correctAnswer:'True' },
      ]
    },
    {
      id:'a_demo2', title:'Payment Team — EOB & Remittance',
      desc:'Assessment on EOB reading, payment posting, and denial management.',
      passingScore:75, mgmtEmail:'manager@gmmbilling.com', teams:['Payment Team'],
      published:true, createdAt:new Date().toISOString(),
      questions:[
        { id:4,text:'What does EOB stand for?',type:'mcq',mandatory:true,points:2,
          explanation:'EOB = Explanation of Benefits.',
          options:['Estimate of Benefits','Explanation of Benefits','Evidence of Billing','Entry of Balance'],
          correctAnswers:[1],correctAnswer:null },
        { id:5,text:'Does Medicare Part B cover inpatient hospital stays?',type:'yn',mandatory:true,points:1,
          explanation:'Part A covers inpatient; Part B covers outpatient.',
          options:['Yes','No'],correctAnswers:[],correctAnswer:'No' },
      ]
    },
    {
      id:'a_demo3', title:'Analyst Team — Revenue Cycle Analytics',
      desc:'Advanced assessment on KPIs, denial trends, and reporting.',
      passingScore:80, mgmtEmail:'manager@gmmbilling.com', teams:['Analyst Team'],
      published:true, createdAt:new Date().toISOString(),
      questions:[
        { id:6,text:'What is the standard clean claim submission timeframe for Medicare?',type:'mcq',mandatory:true,points:2,
          explanation:'Medicare requires claims within 12 months (1 calendar year).',
          options:['90 days','6 months','12 months','24 months'],
          correctAnswers:[2],correctAnswer:null },
        { id:7,text:'A denial rate above 10% is generally considered acceptable in RCM.',type:'tf',mandatory:false,points:1,
          explanation:'Best practice is to keep denial rates under 5%.',
          options:['True','False'],correctAnswers:[],correctAnswer:'False' },
      ]
    }
  ];
  saveAssessments();
}
