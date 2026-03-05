/* ==========================================================
   GMM Billing Solutions — Assessment Portal
   app.js — Complete application logic
   ========================================================== */
'use strict';

/* ── STATE ─────────────────────────────────────────────────── */
var TEAMS = ['Charges Team','Payment Team','Analyst Team','Coding Team','AR Team','Management','Operations'];
var GAS_URL     = '';
var currentUser = null;
var assessments = [];
var currentAID  = null;
var empAnswers  = {};
var lockedQs    = {};
var allResults  = [];
var quizActive  = false;
var warnCount   = 0;
var MAX_WARNS   = 3;
var qType       = 'mcq';
var tfSel       = null;
var ynSel       = null;

/* ── DEMO USERS ─────────────────────────────────────────────── */
var DEMO_USERS = [
  { email:'admin@gmmbilling.com',   password:'Admin@123', name:'Admin User',   role:'admin',    department:'Management',   employeeId:'ADM-001' },
  { email:'charges@gmmbilling.com', password:'Charges@1', name:'Alex Johnson', role:'employee', department:'Charges Team', employeeId:'EMP-001' },
  { email:'payment@gmmbilling.com', password:'Payment@1', name:'Sarah Lee',    role:'employee', department:'Payment Team', employeeId:'EMP-002' },
  { email:'analyst@gmmbilling.com', password:'Analyst@1', name:'Raj Patel',    role:'employee', department:'Analyst Team', employeeId:'EMP-003' }
];

/* ── BOOT ──────────────────────────────────────────────────── */
window.addEventListener('load', function () {
  // Load persisted data
  GAS_URL = localStorage.getItem('gmm_gas_url') || '';
  try { assessments = JSON.parse(localStorage.getItem('gmm_assessments') || '[]'); } catch(e) { assessments = []; }
  seedDemoAssessments();

  // Restore session after page refresh
  var saved = localStorage.getItem('gmm_session');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      showDashboard();
      return;
    } catch(e) { localStorage.removeItem('gmm_session'); }
  }

  // Show login and wire its buttons
  showLogin();
});

/* ── SHOW / HIDE PAGES ─────────────────────────────────────── */
function showLogin() {
  document.getElementById('pg-login').style.display = 'flex';
  document.getElementById('pg-admin').classList.remove('active');
  document.getElementById('pg-employee').classList.remove('active');
  document.getElementById('pg-completed').classList.remove('show');

  // Wire login buttons ONCE
  if (!window._loginWired) {
    window._loginWired = true;
    el('signin-btn').addEventListener('click', doLogin);
    el('eye-btn').addEventListener('click', toggleEye);
    el('li-email').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
    el('li-pass').addEventListener('keydown',  function(e) { if (e.key === 'Enter') doLogin(); });
    document.querySelectorAll('.movl').forEach(function(ov) {
      ov.addEventListener('click', function(e) { if (e.target === ov) ov.classList.remove('open'); });
    });
  }

  var gasInp = el('gas-inp');
  if (gasInp && GAS_URL) gasInp.value = GAS_URL;
}

function showDashboard() {
  document.getElementById('pg-login').style.display = 'none';

  if (currentUser.role === 'admin') {
    document.getElementById('pg-admin').classList.add('active');
    el('adm-nm').textContent = currentUser.name;
    el('adm-av').textContent = currentUser.name[0].toUpperCase();
    wireAdminOnce();
    var gasInp = el('gas-inp');
    if (gasInp && GAS_URL) gasInp.value = GAS_URL;
    var dp = localStorage.getItem('gmm_def_pass');
    var de = localStorage.getItem('gmm_def_email');
    if (dp) el('def-pass').value = dp;
    if (de) el('def-email').value = de;
    renderList();
    populateBuilderSel();
    populateResSel();
  } else {
    document.getElementById('pg-employee').classList.add('active');
    el('emp-nm').textContent = currentUser.name;
    el('emp-av').textContent = currentUser.name[0].toUpperCase();
    wireEmpOnce();
    loadEmpView();
  }
}

/* ── WIRE ADMIN BUTTONS (once) ─────────────────────────────── */
function wireAdminOnce() {
  if (window._adminWired) return;
  window._adminWired = true;

  // Tabs
  document.querySelectorAll('.atab').forEach(function(btn) {
    btn.addEventListener('click', function() { swTab(btn.dataset.tab, btn); });
  });
  el('adm-logout').addEventListener('click', doLogout);

  // Assessments tab
  el('btn-new').addEventListener('click', openNewModal);

  // Builder tab
  el('builder-sel').addEventListener('change', switchBuilderAss);
  document.querySelectorAll('.qpill').forEach(function(p) {
    p.addEventListener('click', function() { setQType(p.dataset.qt, p); });
  });
  el('tf-t').addEventListener('click', function() { pickTF('True'); });
  el('tf-f').addEventListener('click', function() { pickTF('False'); });
  el('yn-y').addEventListener('click', function() { pickYN('Yes'); });
  el('yn-n').addEventListener('click', function() { pickYN('No'); });
  el('f-exp').addEventListener('change', function() { el('s-exp').classList.toggle('hidden', !this.checked); });
  el('choices-wrap').addEventListener('click', function(e) {
    if (e.target.classList.contains('mc-btn')) markC(e.target);
    if (e.target.classList.contains('rmbtn')) rmOpt(e.target);
  });
  el('btn-add-opt').addEventListener('click', addOpt);
  el('btn-add-q').addEventListener('click', addQ);
  el('btn-clear-q').addEventListener('click', clearBuilder);

  // Settings tab
  el('btn-save-gas').addEventListener('click', saveGAS);
  el('btn-test-gas').addEventListener('click', testGAS);
  el('btn-debug').addEventListener('click', debugLogin);
  el('btn-save-def').addEventListener('click', saveDef);

  // Results tab
  el('btn-refresh').addEventListener('click', loadResults);
  el('res-filter').addEventListener('change', filterResults);

  // New modal
  el('btn-create').addEventListener('click', createAssessment);
  el('btn-cancel-new').addEventListener('click', function() { closeModal('modal-new'); });
  el('btn-add-team').addEventListener('click', addTeam);

  // Edit modal
  el('btn-save-edit').addEventListener('click', saveEdit);
  el('btn-cancel-edit').addEventListener('click', function() { closeModal('modal-edit'); });
  el('btn-add-edit-team').addEventListener('click', addEditTeam);
}

function wireEmpOnce() {
  if (window._empWired) return;
  window._empWired = true;
  el('emp-logout').addEventListener('click', doLogout);
  el('comp-exit').addEventListener('click', doLogout);
}

/* ── GAS JSONP CALL ─────────────────────────────────────────── */
/* ── GAS CALL ─────────────────────────────────────────────────
   Strategy:
   1. First use fetch() with redirect:follow to resolve the
      Google redirect (script.google.com → script.googleusercontent.com)
   2. Then inject the RESOLVED URL as a JSONP <script> tag
   This fixes "Script load failed" on GitHub Pages.
   ────────────────────────────────────────────────────────── */
function gasCall(data) {
  return new Promise(function(resolve, reject) {
    var url = GAS_URL;
    if (!url) { reject(new Error('No Apps Script URL configured. Go to Settings and save your URL.')); return; }

    var cb = '_gmm' + Date.now() + '_' + Math.floor(Math.random() * 99999);
    var qs = '?callback=' + encodeURIComponent(cb)
           + '&action='   + encodeURIComponent(data.action || '')
           + '&payload='  + encodeURIComponent(JSON.stringify(data));

    var done = false;
    var timer = setTimeout(function() {
      if (done) return; done = true; cleanup();
      reject(new Error('Timeout after 20s — Apps Script may be slow or URL is wrong'));
    }, 20000);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cb]; } catch(e) {}
      var s = document.getElementById(cb);
      if (s) s.remove();
    }

    function injectScript(finalUrl) {
      window[cb] = function(result) {
        if (done) return; done = true; cleanup(); resolve(result);
      };
      var s = document.createElement('script');
      s.id  = cb;
      s.src = finalUrl + qs;
      s.onerror = function() {
        if (done) return; done = true; cleanup();
        reject(new Error('Failed to load Apps Script. Make sure:
1. URL is correct
2. Deployed as: Execute=Me, Access=Anyone
3. You created a NEW deployment after any code changes'));
      };
      document.head.appendChild(s);
    }

    // Use fetch to follow the Google redirect, then inject the final URL
    fetch(url + qs, { method: 'GET', mode: 'no-cors', redirect: 'follow' })
      .then(function() {
        // fetch succeeded (opaque response is fine) — inject JSONP with original URL
        // Google handles the redirect internally for script tags too
        injectScript(url);
      })
      .catch(function() {
        // fetch blocked — try injecting directly anyway (works in some environments)
        injectScript(url);
      });
  });
}

/* ── LOGIN ──────────────────────────────────────────────────── */
async function doLogin() {
  var email = el('li-email').value.trim();
  var pass  = el('li-pass').value.trim();
  if (!email || !pass) { showErr('Please enter email and password.'); return; }

  var btn = el('signin-btn');
  var txt = el('signin-txt');
  btn.disabled = true;
  txt.innerHTML = '<span class="spin"></span>&nbsp;Signing in…';

  var user = null;

  if (GAS_URL) {
    try {
      var r = await gasCall({ action: 'login', email: email, password: pass });
      if (r && r.success) {
        user = r.user;
      } else {
        btn.disabled = false;
        txt.textContent = 'Sign In →';
        showErr(r ? (r.message || 'Invalid credentials.') : 'Login failed.');
        return;
      }
    } catch(e) {
      // GAS unavailable — try demo accounts
      user = demoLogin(email, pass);
      if (!user) {
        btn.disabled = false;
        txt.textContent = 'Sign In →';
        showErr('Cannot reach Google Sheets. Check your Apps Script URL in Settings.');
        return;
      }
    }
  } else {
    // No GAS configured — use demo accounts
    user = demoLogin(email, pass);
  }

  btn.disabled = false;
  txt.textContent = 'Sign In →';

  if (!user) { showErr('Invalid email or password.'); return; }

  hideErr();
  currentUser = user;
  localStorage.setItem('gmm_session', JSON.stringify(user));
  showDashboard();
}

function demoLogin(email, pass) {
  return DEMO_USERS.find(function(d) {
    return d.email.toLowerCase() === email.toLowerCase() && d.password === pass;
  }) || null;
}

function doLogout() {
  stopLock();
  localStorage.removeItem('gmm_session');
  currentUser = null;
  empAnswers  = {};
  lockedQs    = {};
  quizActive  = false;
  allResults  = [];
  window._adminWired = false;
  window._empWired   = false;
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('pg-completed').classList.remove('show');
  var ov = document.getElementById('ac-overlay');
  if (ov) ov.remove();
  showLogin();
}

function toggleEye() {
  var inp = el('li-pass');
  var btn = el('eye-btn');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    btn.textContent = '👁';
  }
}

function showErr(m) { el('lerr-msg').textContent = m; el('lerr').classList.add('show'); }
function hideErr()  { el('lerr').classList.remove('show'); }

/* ── GAS SETTINGS ───────────────────────────────────────────── */
function saveGAS() {
  var v = el('gas-inp').value.trim();
  if (!v) { toast('Enter a URL', 'err'); return; }
  if (!v.includes('script.google.com')) { toast('Must be a script.google.com URL', 'err'); return; }
  GAS_URL = v;
  localStorage.setItem('gmm_gas_url', v);
  el('gas-status').innerHTML = '<span class="conn-status conn-ok">✓ URL Saved</span>';
  toast('✓ URL saved!', 'ok');
}

async function testGAS() {
  var v = el('gas-inp').value.trim() || GAS_URL;
  if (!v) { toast('No URL configured', 'err'); return; }
  var savedURL = GAS_URL;
  GAS_URL = v;
  var btn = el('btn-test-gas');
  btn.innerHTML = '<span class="spin"></span>&nbsp;Testing…'; btn.disabled = true;
  el('gas-status').innerHTML = '<span class="conn-status conn-wait">⏳ Connecting to Google Sheets…</span>';
  try {
    var r = await gasCall({ action: 'ping' });
    if (r && r.success) {
      el('gas-status').innerHTML = '<span class="conn-status conn-ok">✅ Connected to Google Sheets!</span>';
      toast('✅ Connected!', 'ok');
      GAS_URL = v;
      localStorage.setItem('gmm_gas_url', v);
    } else {
      el('gas-status').innerHTML = '<span class="conn-status conn-err">⚠ Script responded but returned an error: ' + (r ? r.message : 'Unknown') + '</span>';
      toast('⚠ Check Apps Script code', 'err');
      GAS_URL = savedURL;
    }
  } catch(e) {
    el('gas-status').innerHTML = '<span class="conn-status conn-err">❌ ' + e.message.replace(/\n/g, ' ') + '</span>';
    toast('❌ Connection failed', 'err');
    GAS_URL = savedURL;
  }
  btn.textContent = '🔌 Test Connection'; btn.disabled = false;
}

async function debugLogin() {
  var email = prompt('Email to debug:', el('li-email') ? el('li-email').value : '');
  var pass  = prompt('Password:', '');
  if (!email) return;
  try {
    var r = await gasCall({ action: 'debug', email: email, password: pass || '' });
    alert(JSON.stringify(r, null, 2).substring(0, 2000));
  } catch(e) { alert('Debug failed: ' + e.message); }
}

function saveDef() {
  var p = el('def-pass').value; var e = el('def-email').value.trim();
  if (p) localStorage.setItem('gmm_def_pass', p);
  if (e) localStorage.setItem('gmm_def_email', e);
  toast('✓ Defaults saved', 'ok');
}

/* ── ADMIN TABS ─────────────────────────────────────────────── */
function swTab(id, btn) {
  document.querySelectorAll('.atab').forEach(function(t) { t.classList.remove('on'); });
  document.querySelectorAll('.tpane').forEach(function(p) { p.classList.remove('on'); });
  btn.classList.add('on');
  el('tp-' + id).classList.add('on');
  if (id === 'assessments') renderList();
}

/* ── ASSESSMENT LIST ────────────────────────────────────────── */
function renderList() {
  var c = el('assessments-list');
  if (!assessments.length) {
    c.innerHTML = '<div class="empty"><div class="ei">📋</div><p>No assessments yet. Click "+ New Assessment".</p></div>';
    return;
  }
  c.innerHTML = assessments.map(function(a) {
    var qc = (a.questions || []).length;
    return '<div class="acard" data-id="' + a.id + '">'
      + '<div class="acard-icon">' + icon(a.title) + '</div>'
      + '<div class="acard-body">'
      + '<div class="acard-title">' + esc(a.title) + '</div>'
      + '<div class="acard-meta">'
      + '<span class="chip ch-blue">' + qc + ' Q</span>'
      + '<span class="chip ch-gold">Pass ' + a.passingScore + '%</span>'
      + '<span class="chip ' + (a.published ? 'ch-green' : 'ch-gray') + '">' + (a.published ? '✓ Live' : 'Draft') + '</span>'
      + '</div>'
      + '<div class="acard-teams">' + ((a.teams && a.teams.length) ? '🏢 ' + a.teams.join(' · ') : '<span style="color:var(--g500)">No teams</span>') + '</div>'
      + '</div>'
      + '<div class="acard-actions">'
      + '<button class="btn b-blue b-sm pub-btn" type="button" data-id="' + a.id + '">' + (a.published ? 'Unpublish' : 'Publish') + '</button>'
      + '<button class="btn b-red b-sm del-btn"  type="button" data-id="' + a.id + '">Delete</button>'
      + '</div></div>';
  }).join('');

  c.querySelectorAll('.acard').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.classList.contains('pub-btn') || e.target.classList.contains('del-btn')) return;
      openEditModal(card.dataset.id);
    });
  });
  c.querySelectorAll('.pub-btn').forEach(function(b) {
    b.addEventListener('click', function(e) { e.stopPropagation(); togglePub(b.dataset.id); });
  });
  c.querySelectorAll('.del-btn').forEach(function(b) {
    b.addEventListener('click', function(e) { e.stopPropagation(); delAssessment(b.dataset.id); });
  });
}

function icon(t) {
  t = (t || '').toLowerCase();
  if (t.includes('charge'))  return '💰';
  if (t.includes('payment')) return '💳';
  if (t.includes('analyst')) return '📊';
  if (t.includes('coding'))  return '🔤';
  return '📋';
}

/* ── NEW ASSESSMENT ─────────────────────────────────────────── */
function openNewModal() {
  el('na-title').value = '';
  el('na-desc').value  = '';
  el('na-pass').value  = localStorage.getItem('gmm_def_pass') || 70;
  el('na-email').value = localStorage.getItem('gmm_def_email') || '';
  buildTeamCBs('team-cbs', []);
  openModal('modal-new');
}

function buildTeamCBs(containerId, selected) {
  var all = new Set(TEAMS);
  assessments.forEach(function(a) { (a.teams || []).forEach(function(t) { all.add(t); }); });
  var c = el(containerId);
  c.innerHTML = '';
  all.forEach(function(t) {
    var on  = selected.indexOf(t) > -1;
    var lbl = document.createElement('label');
    lbl.className = 'team-cb' + (on ? ' on' : '');
    var inp = document.createElement('input');
    inp.type = 'checkbox'; inp.value = t; if (on) inp.checked = true;
    inp.addEventListener('change', function() { lbl.classList.toggle('on', inp.checked); });
    lbl.appendChild(inp);
    lbl.appendChild(document.createTextNode(' ' + t));
    c.appendChild(lbl);
  });
}

function getChecked(containerId) {
  return Array.from(document.querySelectorAll('#' + containerId + ' input:checked')).map(function(i) { return i.value; });
}

function addTeam() {
  var v = el('new-team-inp').value.trim(); if (!v) return;
  addTeamLabel('team-cbs', v); el('new-team-inp').value = '';
}
function addEditTeam() {
  var v = el('edit-team-inp').value.trim(); if (!v) return;
  addTeamLabel('edit-team-cbs', v); el('edit-team-inp').value = '';
}
function addTeamLabel(cid, name) {
  var c = el(cid);
  var lbl = document.createElement('label');
  lbl.className = 'team-cb on';
  var inp = document.createElement('input');
  inp.type = 'checkbox'; inp.value = name; inp.checked = true;
  inp.addEventListener('change', function() { lbl.classList.toggle('on', inp.checked); });
  lbl.appendChild(inp);
  lbl.appendChild(document.createTextNode(' ' + name));
  c.appendChild(lbl);
}

function createAssessment() {
  var title = el('na-title').value.trim();
  if (!title) { toast('Enter a title', 'err'); return; }
  var a = {
    id: 'a_' + Date.now(), title: title,
    desc: el('na-desc').value.trim(),
    passingScore: parseInt(el('na-pass').value) || 70,
    mgmtEmail:    el('na-email').value.trim(),
    teams: getChecked('team-cbs'),
    questions: [], published: false, createdAt: new Date().toISOString()
  };
  assessments.push(a); saveData();
  closeModal('modal-new');
  renderList(); populateBuilderSel(); populateResSel();
  toast('✓ "' + title + '" created', 'ok');
}

/* ── EDIT ASSESSMENT ────────────────────────────────────────── */
function openEditModal(id) {
  var a = findA(id); if (!a) return;
  el('edit-aid').value           = id;
  el('edit-title-h').textContent = 'Edit: ' + a.title;
  el('edit-title').value         = a.title;
  el('edit-desc').value          = a.desc || '';
  el('edit-pass').value          = a.passingScore || 70;
  el('edit-email').value         = a.mgmtEmail || '';
  buildTeamCBs('edit-team-cbs', a.teams || []);
  openModal('modal-edit');
}

function saveEdit() {
  var id = el('edit-aid').value;
  var a  = findA(id); if (!a) return;
  var title = el('edit-title').value.trim();
  if (!title) { toast('Title required', 'err'); return; }
  a.title        = title;
  a.desc         = el('edit-desc').value.trim();
  a.passingScore = parseInt(el('edit-pass').value) || 70;
  a.mgmtEmail    = el('edit-email').value.trim();
  a.teams        = getChecked('edit-team-cbs');
  saveData(); closeModal('modal-edit');
  renderList(); populateBuilderSel(); populateResSel();
  toast('✓ Updated', 'ok');
}

function togglePub(id) {
  var a = findA(id); if (!a) return;
  if (!a.published && !(a.questions || []).length) { toast('Add questions first', 'err'); return; }
  if (!a.published && !(a.teams || []).length)     { toast('Assign a team first', 'err'); return; }
  a.published = !a.published;
  saveData(); renderList();
  toast(a.published ? '✓ "' + a.title + '" is live' : '"' + a.title + '" unpublished', 'ok');
}

function delAssessment(id) {
  if (!confirm('Delete this assessment?')) return;
  assessments = assessments.filter(function(a) { return a.id !== id; });
  saveData(); renderList(); populateBuilderSel(); populateResSel();
  if (currentAID === id) { currentAID = null; renderQList(); }
  toast('Deleted', 'ok');
}

/* ── QUESTION BUILDER ───────────────────────────────────────── */
function populateBuilderSel() {
  var sel = el('builder-sel');
  sel.innerHTML = '<option value="">-- Select Assessment --</option>';
  assessments.forEach(function(a) {
    var o = document.createElement('option');
    o.value = a.id; o.textContent = a.title;
    if (a.id === currentAID) o.selected = true;
    sel.appendChild(o);
  });
}

function switchBuilderAss() {
  currentAID = el('builder-sel').value || null;
  var a = currentAID ? findA(currentAID) : null;
  el('builder-lbl').textContent = a ? 'Building: ' + a.title : 'Select an assessment first';
  renderQList();
}

function setQType(t, btn) {
  qType = t;
  document.querySelectorAll('.qpill').forEach(function(p) { p.classList.remove('on'); });
  btn.classList.add('on');
  el('s-mcq').classList.toggle('hidden',  !['mcq','multi'].includes(t));
  el('s-tf').classList.toggle('hidden',   t !== 'tf');
  el('s-yn').classList.toggle('hidden',   t !== 'yn');
  el('s-text').classList.toggle('hidden', t !== 'text');
}

function markC(btn) {
  if (qType !== 'multi') document.querySelectorAll('#choices-wrap .mc-btn').forEach(function(b) { b.classList.remove('on'); });
  btn.classList.toggle('on');
}

function addOpt() {
  var wrap = el('choices-wrap');
  var idx  = wrap.children.length;
  var labs = 'ABCDEFGHIJ';
  var row  = document.createElement('div'); row.className = 'crow';
  var mc   = document.createElement('button'); mc.type = 'button'; mc.className = 'mc-btn'; mc.textContent = '✓';
  var inp  = document.createElement('input'); inp.className = 'cinp'; inp.placeholder = 'Option ' + (labs[idx] || idx+1);
  var rm   = document.createElement('button'); rm.type = 'button'; rm.className = 'rmbtn'; rm.textContent = '×';
  row.appendChild(mc); row.appendChild(inp); row.appendChild(rm);
  wrap.appendChild(row);
}

function rmOpt(btn) {
  if (el('choices-wrap').children.length > 2) btn.closest('.crow').remove();
  else toast('Need at least 2 options', 'err');
}

function pickTF(v) {
  tfSel = v;
  el('tf-t').classList.toggle('sel', v === 'True');
  el('tf-f').classList.toggle('sel', v === 'False');
}

function pickYN(v) {
  ynSel = v;
  el('yn-y').classList.toggle('sel', v === 'Yes');
  el('yn-n').classList.toggle('sel', v === 'No');
}

function addQ() {
  if (!currentAID) { toast('Select an assessment first', 'err'); return; }
  var a    = findA(currentAID);
  var text = el('q-text').value.trim();
  if (!text) { toast('Enter question text', 'err'); return; }

  var q = {
    id: Date.now(), text: text, type: qType,
    mandatory:   el('f-mand').checked,
    points:      parseInt(el('f-pts').value) || 1,
    explanation: el('f-exp').checked ? el('exp-txt').value.trim() : '',
    options: [], correctAnswers: [], correctAnswer: null
  };

  if (['mcq','multi'].includes(qType)) {
    document.querySelectorAll('#choices-wrap .crow').forEach(function(row) {
      var val = row.querySelector('.cinp').value.trim();
      if (val) {
        q.options.push(val);
        if (row.querySelector('.mc-btn').classList.contains('on')) q.correctAnswers.push(q.options.length - 1);
      }
    });
    if (q.options.length < 2)       { toast('Add at least 2 options', 'err'); return; }
    if (!q.correctAnswers.length)   { toast('Mark a correct answer (click ✓)', 'err'); return; }
  } else if (qType === 'tf') {
    if (!tfSel) { toast('Select True or False answer', 'err'); return; }
    q.options = ['True','False']; q.correctAnswer = tfSel;
  } else if (qType === 'yn') {
    if (!ynSel) { toast('Select Yes or No answer', 'err'); return; }
    q.options = ['Yes','No']; q.correctAnswer = ynSel;
  } else {
    q.correctAnswer = el('text-key').value.trim();
  }

  a.questions.push(q);
  saveData(); renderQList(); clearBuilder();
  toast('✓ Question added', 'ok');
}

function clearBuilder() {
  el('q-text').value   = '';
  el('f-pts').value    = 1;
  el('f-mand').checked = false;
  el('f-exp').checked  = false;
  el('exp-txt').value  = '';
  el('s-exp').classList.add('hidden');
  el('text-key').value = '';
  tfSel = null; ynSel = null;
  document.querySelectorAll('#choices-wrap .mc-btn').forEach(function(b) { b.classList.remove('on'); });
  ['tf-t','tf-f','yn-y','yn-n'].forEach(function(id) { var e2 = document.getElementById(id); if (e2) e2.classList.remove('sel'); });
}

function renderQList() {
  var c   = el('q-list');
  var lbl = el('q-count');
  var a   = currentAID ? findA(currentAID) : null;
  var qs  = a ? (a.questions || []) : [];
  lbl.textContent = qs.length + ' question' + (qs.length !== 1 ? 's' : '');
  if (!qs.length) { c.innerHTML = '<div class="empty"><div class="ei">❓</div><p>No questions yet.</p></div>'; return; }
  var types = { mcq:'MCQ', multi:'Multi-Select', tf:'True/False', yn:'Yes/No', text:'Short Answer' };
  c.innerHTML = qs.map(function(q, i) {
    return '<div class="qi">'
      + '<div class="qnum">Q' + (i+1) + '</div>'
      + '<div class="qbody"><div class="qtxt">' + esc(q.text) + (q.mandatory ? '<span class="mstar">*</span>' : '') + '</div>'
      + '<div class="qchips"><span class="chip ch-blue">' + (types[q.type]||q.type) + '</span>'
      + '<span class="chip ch-gold">' + q.points + 'pt' + (q.points>1?'s':'') + '</span>'
      + (q.explanation ? '<span class="chip ch-green">Explanation</span>' : '')
      + '</div></div>'
      + '<button class="qdel" type="button" data-aid="' + a.id + '" data-idx="' + i + '">×</button>'
      + '</div>';
  }).join('');
  c.querySelectorAll('.qdel').forEach(function(b) {
    b.addEventListener('click', function() { delQ(b.dataset.aid, parseInt(b.dataset.idx)); });
  });
}

function delQ(aid, idx) {
  var a = findA(aid); if (!a) return;
  a.questions.splice(idx, 1);
  saveData(); renderQList();
  toast('Removed', 'ok');
}

/* ── RESULTS ────────────────────────────────────────────────── */
function populateResSel() {
  var sel = el('res-filter');
  sel.innerHTML = '<option value="">All Assessments</option>';
  assessments.forEach(function(a) {
    var o = document.createElement('option'); o.value = a.id; o.textContent = a.title; sel.appendChild(o);
  });
}

async function loadResults() {
  var c = el('results-area');
  if (!GAS_URL) { c.innerHTML = '<div class="empty"><div class="ei">🔗</div><p>Set your Apps Script URL in Settings first.</p></div>'; return; }
  c.innerHTML = '<div class="empty"><div class="ei"><span class="spin"></span></div><p>Loading…</p></div>';
  try {
    var r = await gasCall({ action: 'getResults' });
    allResults = (r && r.results) ? r.results : [];
    renderResults(allResults);
  } catch(e) {
    c.innerHTML = '<div class="empty"><div class="ei">⚠</div><p>' + e.message + '</p></div>';
  }
}

function filterResults() {
  var id = el('res-filter').value;
  var a  = id ? findA(id) : null;
  renderResults(a ? allResults.filter(function(r) { return r.assessmentTitle === a.title; }) : allResults);
}

function renderResults(data) {
  var c = el('results-area');
  if (!data.length) { c.innerHTML = '<div class="empty"><div class="ei">📊</div><p>No results yet.</p></div>'; return; }
  var rows = data.map(function(r) {
    var tot = (parseInt(r.correct)||0) + (parseInt(r.wrong)||0) + (parseInt(r.skipped)||0);
    return '<tr>'
      + '<td><div style="font-weight:600">' + esc(r.employeeName||'—') + '</div>'
      + '<div style="font-size:11px;color:var(--g500)">' + esc(r.employeeEmail||'') + '</div></td>'
      + '<td style="color:var(--g300)">' + esc(r.department||'—') + '</td>'
      + '<td>' + esc(r.assessmentTitle||'—') + '</td>'
      + '<td><strong style="color:var(--blue-lt);font-size:15px">' + (r.score||0) + '%</strong></td>'
      + '<td><span class="pb ' + (r.passed==='Pass'?'p':'f') + '">' + (r.passed||'—') + '</span></td>'
      + '<td>' + (r.correct||0) + ' / ' + tot + '</td>'
      + '<td style="color:var(--g500);font-size:11px">' + esc(r.submittedAt||'—') + '</td>'
      + '</tr>';
  }).join('');
  c.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">'
    + '<button class="btn b-gold b-sm" type="button" id="btn-export">⬇ Export Excel</button></div>'
    + '<div class="rtw"><table class="rt"><thead><tr>'
    + '<th>Employee</th><th>Dept</th><th>Assessment</th><th>Score</th><th>Result</th><th>Correct</th><th>Submitted</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  el('btn-export').addEventListener('click', exportExcel);
}

function exportExcel() {
  if (!allResults.length) { toast('No data to export', 'err'); return; }
  var headers = ['Employee Name','Email','Employee ID','Department','Assessment','Score (%)','Earned','Total','Result','Correct','Wrong','Skipped','Submitted','Manager Email'];
  function csvEsc(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var rows = allResults.map(function(r) {
    return [r.employeeName,r.employeeEmail,r.employeeId,r.department,r.assessmentTitle,
            r.score,r.earnedPoints,r.totalPoints,r.passed,r.correct,r.wrong,r.skipped,r.submittedAt,r.mgmtEmail]
           .map(csvEsc).join(',');
  });
  var csv  = [headers.map(csvEsc).join(',')].concat(rows).join('\r\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'GMM_Results_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('✓ Downloaded!', 'ok');
}

/* ── EMPLOYEE QUIZ ───────────────────────────────────────────── */
function loadEmpView() {
  var area  = el('emp-quiz-area');
  var dept  = (currentUser.department || '').trim();
  var email = currentUser.email;
  var avail = assessments.filter(function(a) {
    return a.published && (a.teams || []).some(function(t) { return t.toLowerCase() === dept.toLowerCase(); });
  });
  if (!avail.length) {
    area.innerHTML = '<div class="not-assigned"><div class="icon">🔒</div><h2>No Assessment Assigned</h2><p>No active assessments for <strong>' + esc(dept) + '</strong>. Contact your administrator.</p></div>';
    return;
  }
  var todo = avail.filter(function(a) { return !localStorage.getItem('gmm_done_' + email + '_' + a.id); });
  if (!todo.length) {
    area.innerHTML = '<div class="already-done"><div class="icon">✅</div><h2>All Done!</h2><p>You have completed all your assessments. Each can only be taken once.</p><div style="margin-top:28px"><button class="btn b-ghost" type="button" id="done-out">Exit</button></div></div>';
    el('done-out').addEventListener('click', doLogout);
    return;
  }
  startQuiz(todo[0]);
}

function startQuiz(a) {
  empAnswers = {}; lockedQs = {};
  startLock();
  var area   = el('emp-quiz-area');
  var total  = (a.questions || []).reduce(function(s, q) { return s + q.points; }, 0);
  var labs   = 'ABCDEFGH';
  var hints  = { mcq:'Choose one answer', multi:'Select all that apply', tf:'True or False — locked on first click', yn:'Yes or No — locked on first click', text:'Type your answer' };

  var qHTML = (a.questions || []).map(function(q, qi) {
    var opts = '';
    if (['mcq','multi'].includes(q.type)) {
      opts = '<div class="opts">' + q.options.map(function(o, oi) {
        return '<button class="opt" type="button" data-qi="'+qi+'" data-oi="'+oi+'" data-type="'+q.type+'" data-aid="'+a.id+'">'
          + '<div class="odot">' + (labs[oi]||oi) + '</div>' + esc(o) + '</button>';
      }).join('') + '</div>';
    } else if (q.type === 'tf' || q.type === 'yn') {
      var os = q.type === 'tf' ? ['True','False'] : ['Yes','No'];
      var ic = q.type === 'tf' ? ['T','F'] : ['Y','N'];
      opts = '<div class="tf-row">' + os.map(function(v, oi) {
        return '<button class="opt" type="button" data-qi="'+qi+'" data-oi="'+oi+'" data-type="single" data-aid="'+a.id+'">'
          + '<div class="odot">' + ic[oi] + '</div>' + v + '</button>';
      }).join('') + '</div>';
    } else {
      opts = '<textarea class="tans" data-qi="'+qi+'" data-aid="'+a.id+'" placeholder="Type your answer…"></textarea>';
    }
    return '<div class="qcard" id="qc-'+qi+'">'
      + '<div class="qctop"><div class="qnb">Q'+(qi+1)+' · '+q.points+'pt'+(q.points>1?'s':'')+'</div>'
      + '<div class="qqtxt">'+esc(q.text)+(q.mandatory?'<span class="mstar">*</span>':'')+'</div></div>'
      + '<div class="qhint">'+(hints[q.type]||'')+'</div>'
      + opts + '</div>';
  }).join('');

  area.innerHTML = '<div class="qhd"><h1>' + esc(a.title) + '</h1>'
    + '<p style="color:var(--g300);font-size:13px">' + esc(a.desc||'Read each question carefully.') + '</p>'
    + '<div class="qmeta">'
    + '<div class="qmi">📋 ' + a.questions.length + ' Qs</div>'
    + '<div class="qmi">🏅 ' + total + ' pts</div>'
    + '<div class="qmi">✅ Pass: ' + a.passingScore + '%</div>'
    + '<div class="qmi" style="color:#ff8080">🔒 Stay on this tab</div>'
    + '</div></div>'
    + '<div class="pbar"><div class="pfill" id="ep-prog" style="width:0%"></div></div>'
    + qHTML
    + '<div class="subbox"><h3>Submit Assessment</h3>'
    + '<p>Once submitted results are sent to the manager and cannot be undone.</p>'
    + '<div class="cpl-row"><span style="font-size:12px;color:var(--g300)">Answered:</span>'
    + '<div class="cpl-bar"><div class="cpl-fill" id="ep-fill" style="width:0%"></div></div>'
    + '<span class="cpl-lbl" id="ep-lbl">0 / ' + a.questions.length + '</span></div>'
    + '<button class="btn b-gold b-full" type="button" id="submit-btn" style="font-size:15px;padding:15px">📤 Submit &amp; Send Results</button></div>';

  // Wire answer clicks
  area.querySelectorAll('.opt[data-qi]').forEach(function(btn) {
    btn.addEventListener('click', function() { pick(parseInt(btn.dataset.qi), parseInt(btn.dataset.oi), btn.dataset.type, btn.dataset.aid); });
  });
  area.querySelectorAll('textarea.tans').forEach(function(ta) {
    ta.addEventListener('input', function() { pickText(parseInt(ta.dataset.qi), ta.value, ta.dataset.aid); });
  });
  el('submit-btn').addEventListener('click', function() { submitQuiz(a.id); });
}

function pick(qi, oi, type, aid) {
  if (lockedQs[qi]) { toast('Answer locked', 'err'); return; }
  if (!empAnswers[qi]) empAnswers[qi] = [];
  if (type === 'multi') {
    var x = empAnswers[qi].indexOf(oi);
    if (x > -1) empAnswers[qi].splice(x, 1); else empAnswers[qi].push(oi);
  } else {
    empAnswers[qi] = [oi]; lockedQs[qi] = true;
    var a = findA(aid);
    if (a) (a.questions[qi].options||[]).forEach(function(_, i) {
      var b = document.getElementById('op-' + qi + '-' + i);
      // use queryselector since ids not set, find by data attrs
    });
    var optBtns = document.querySelectorAll('[data-qi="'+qi+'"].opt');
    optBtns.forEach(function(b) { b.classList.add('locked'); });
  }
  var optBtns2 = document.querySelectorAll('[data-qi="'+qi+'"].opt');
  optBtns2.forEach(function(b) { b.classList.toggle('sel', empAnswers[qi].includes(parseInt(b.dataset.oi))); });
  var qc = document.getElementById('qc-'+qi); if (qc) qc.classList.toggle('done', empAnswers[qi].length > 0);
  updateProg(aid);
}

function pickText(qi, v, aid) {
  empAnswers[qi] = v.trim() ? [v.trim()] : [];
  var qc = document.getElementById('qc-'+qi); if (qc) qc.classList.toggle('done', v.trim().length > 0);
  updateProg(aid);
}

function updateProg(aid) {
  var a   = findA(aid); if (!a) return;
  var tot = a.questions.length;
  var ans = Object.keys(empAnswers).filter(function(k) { return empAnswers[k] && empAnswers[k].length > 0; }).length;
  var p   = tot ? (ans/tot)*100 : 0;
  var pr  = el('ep-prog'); if (pr) pr.style.width = p + '%';
  var fi  = el('ep-fill'); if (fi) fi.style.width = p + '%';
  var lb  = el('ep-lbl');  if (lb) lb.textContent = ans + ' / ' + tot;
}

async function submitQuiz(aid) {
  var a  = findA(aid); if (!a) return;
  var qs = a.questions;
  var missing = qs.filter(function(q, i) { return q.mandatory && (!empAnswers[i] || !empAnswers[i].length); });
  if (missing.length) { toast('Answer all mandatory (*) questions — ' + missing.length + ' left', 'err'); return; }

  var btn = el('submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>&nbsp;Submitting…';

  var earned=0, total=0, correct=0, wrong=0, skipped=0;
  qs.forEach(function(q, qi) {
    total += q.points;
    var ans = empAnswers[qi] || []; var has = ans.length > 0; var ok = false;
    if (['mcq','multi'].includes(q.type)) {
      ok = has && [].concat(ans).sort().join(',') === [].concat(q.correctAnswers).sort().join(',');
    } else if (q.type === 'tf' || q.type === 'yn') {
      var opts = q.type === 'tf' ? ['True','False'] : ['Yes','No'];
      ok = has && opts[ans[0]] === q.correctAnswer;
    } else {
      ok = has && (q.correctAnswer ? (ans[0]||'').toLowerCase().includes(q.correctAnswer.toLowerCase()) : true);
    }
    if (!has) skipped++; else if (ok) { correct++; earned += q.points; } else wrong++;
  });

  var pct    = total ? Math.round((earned/total)*100) : 0;
  var passed = pct >= a.passingScore;

  var payload = {
    action:'saveResult',
    employeeName:currentUser.name, employeeEmail:currentUser.email,
    employeeId:currentUser.employeeId||'', department:currentUser.department||'',
    assessmentId:a.id, assessmentTitle:a.title,
    score:pct, earnedPoints:earned, totalPoints:total,
    passed:passed?'Pass':'Fail', correct:correct, wrong:wrong, skipped:skipped,
    submittedAt:new Date().toLocaleString(), mgmtEmail:a.mgmtEmail||''
  };

  if (GAS_URL) { try { await gasCall(payload); } catch(e) { console.warn('Save failed:', e.message); } }

  localStorage.setItem('gmm_done_' + currentUser.email + '_' + a.id, '1');
  stopLock();

  document.getElementById('pg-employee').classList.remove('active');
  el('comp-sub').textContent = 'Your responses have been recorded. Score: ' + pct + '% — ' + (passed?'PASSED ✅':'Did not pass ❌');
  document.getElementById('pg-completed').classList.add('show');
}

/* ── ANTI-CHEAT LOCK ─────────────────────────────────────────── */
function startLock() {
  quizActive = true; warnCount = 0;
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', onBlur);
  document.addEventListener('contextmenu', noCtx);
  document.addEventListener('keydown', noKeys);
  window.addEventListener('beforeunload', onUnload);
}
function stopLock() {
  quizActive = false;
  document.removeEventListener('visibilitychange', onVis);
  window.removeEventListener('blur', onBlur);
  document.removeEventListener('contextmenu', noCtx);
  document.removeEventListener('keydown', noKeys);
  window.removeEventListener('beforeunload', onUnload);
}
function onVis()  { if (!quizActive || !document.hidden) return; warnCount++; showWarn('⚠ You switched tabs!'); }
function onBlur() {
  if (!quizActive) return;
  setTimeout(function() {
    if (!quizActive || document.hasFocus()) return;
    warnCount++; showWarn('⚠ You clicked outside the assessment window!');
  }, 400);
}
function noCtx(e)  { if (quizActive) { e.preventDefault(); return false; } }
function noKeys(e) {
  if (!quizActive) return;
  if (e.key==='F12' || (e.ctrlKey&&e.shiftKey&&'IJC'.includes(e.key.toUpperCase())) || (e.altKey&&e.key==='Tab') || e.key==='PrintScreen') {
    e.preventDefault(); return false;
  }
}
function onUnload(e) { if (quizActive) { e.preventDefault(); e.returnValue='Assessment in progress!'; return e.returnValue; } }

function showWarn(msg) {
  var old = document.getElementById('ac-overlay'); if (old) old.remove();
  var ov  = document.createElement('div'); ov.id = 'ac-overlay';
  var remaining = MAX_WARNS - warnCount;
  if (warnCount >= MAX_WARNS) {
    ov.innerHTML = '<div style="font-size:56px;margin-bottom:20px">🚫</div>'
      + '<div style="font-family:\'Playfair Display\',serif;font-size:28px;color:#ff4d4d;margin-bottom:12px">Assessment Terminated</div>'
      + '<div style="font-size:15px;color:#8899bb;max-width:440px;line-height:1.7;margin-bottom:28px">You switched away ' + MAX_WARNS + ' times. Your session has ended.</div>'
      + '<button id="ac-exit" type="button" style="background:linear-gradient(135deg,#ff4d4d,#ff8080);border:none;border-radius:11px;padding:13px 36px;color:#fff;font-family:Outfit,sans-serif;font-size:15px;font-weight:700;cursor:pointer">Exit</button>';
    document.body.appendChild(ov);
    el('ac-exit').addEventListener('click', function() { stopLock(); ov.remove(); doLogout(); });
  } else {
    ov.innerHTML = '<div style="font-size:56px;margin-bottom:20px">⚠️</div>'
      + '<div style="font-family:\'Playfair Display\',serif;font-size:26px;color:#f5c842;margin-bottom:12px">Warning ' + warnCount + ' of ' + MAX_WARNS + '</div>'
      + '<div style="font-size:15px;color:#8899bb;max-width:440px;line-height:1.7;margin-bottom:8px">' + msg + '</div>'
      + '<div style="font-size:13px;color:#ff8080;margin-bottom:28px">' + remaining + ' warning' + (remaining!==1?'s':'') + ' before termination.</div>'
      + '<button id="ac-ret" type="button" style="background:linear-gradient(135deg,#1a6fff,#4d8fff);border:none;border-radius:11px;padding:13px 36px;color:#fff;font-family:Outfit,sans-serif;font-size:15px;font-weight:700;cursor:pointer">Return to Assessment</button>';
    document.body.appendChild(ov);
    el('ac-ret').addEventListener('click', function() { ov.remove(); window.focus(); });
  }
}

/* ── MODALS ──────────────────────────────────────────────────── */
function openModal(id)  { el(id).classList.add('open'); }
function closeModal(id) { el(id).classList.remove('open'); }

/* ── TOAST ───────────────────────────────────────────────────── */
function toast(msg, type) {
  type = type || 'ok';
  el('t-msg').textContent = msg;
  el('t-ico').textContent = type === 'ok' ? '✓' : '⚠';
  var t = el('toast'); t.className = 'toast ' + type + ' show';
  clearTimeout(window._tt);
  window._tt = setTimeout(function() { t.className = 'toast ' + type; }, 3500);
}

/* ── HELPERS ─────────────────────────────────────────────────── */
function el(id)     { return document.getElementById(id); }
function findA(id)  { return assessments.find(function(a) { return a.id === id; }); }
function saveData() { try { localStorage.setItem('gmm_assessments', JSON.stringify(assessments)); } catch(e) {} }
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── SEED DEMO ASSESSMENTS ───────────────────────────────────── */
function seedDemoAssessments() {
  if (assessments.length) return;
  assessments = [
    { id:'a_d1', title:'Charges Team — Medical Billing Fundamentals',
      desc:'Test your knowledge of charge entry, CPT codes and billing workflows.',
      passingScore:70, mgmtEmail:'manager@gmmbilling.com', teams:['Charges Team'],
      published:true, createdAt:new Date().toISOString(), questions:[
        { id:1, text:'What does CPT stand for?', type:'mcq', mandatory:true, points:2, explanation:'Current Procedural Terminology',
          options:['Current Patient Treatment','Current Procedural Terminology','Certified Payment Terms','Clinical Processing Tools'], correctAnswers:[1], correctAnswer:null },
        { id:2, text:'Which claim form is used for professional/outpatient billing?', type:'mcq', mandatory:true, points:2, explanation:'CMS-1500',
          options:['UB-04','CMS-1450','CMS-1500','ADA Form'], correctAnswers:[2], correctAnswer:null },
        { id:3, text:'Charge entry must be completed within 24 hours of the patient visit.', type:'tf', mandatory:false, points:1, explanation:'Timely entry is critical.',
          options:['True','False'], correctAnswers:[], correctAnswer:'True' }
      ]
    },
    { id:'a_d2', title:'Payment Team — EOB & Remittance',
      desc:'Assessment on EOB reading, payment posting and denial management.',
      passingScore:75, mgmtEmail:'manager@gmmbilling.com', teams:['Payment Team'],
      published:true, createdAt:new Date().toISOString(), questions:[
        { id:4, text:'What does EOB stand for?', type:'mcq', mandatory:true, points:2, explanation:'Explanation of Benefits',
          options:['Estimate of Benefits','Explanation of Benefits','Evidence of Billing','Entry of Balance'], correctAnswers:[1], correctAnswer:null },
        { id:5, text:'Does Medicare Part B cover inpatient hospital stays?', type:'yn', mandatory:true, points:1, explanation:'Part A covers inpatient.',
          options:['Yes','No'], correctAnswers:[], correctAnswer:'No' }
      ]
    },
    { id:'a_d3', title:'Analyst Team — Revenue Cycle Analytics',
      desc:'Advanced KPIs, denial trends and reporting.',
      passingScore:80, mgmtEmail:'manager@gmmbilling.com', teams:['Analyst Team'],
      published:true, createdAt:new Date().toISOString(), questions:[
        { id:6, text:'Standard Medicare clean claim submission timeframe?', type:'mcq', mandatory:true, points:2, explanation:'12 months / 1 calendar year.',
          options:['90 days','6 months','12 months','24 months'], correctAnswers:[2], correctAnswer:null },
        { id:7, text:'A denial rate above 10% is acceptable in RCM.', type:'tf', mandatory:false, points:1, explanation:'Best practice is under 5%.',
          options:['True','False'], correctAnswers:[], correctAnswer:'False' }
      ]
    }
  ];
  saveData();
}
