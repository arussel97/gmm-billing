/* ══════════════════════════════════════════════════════
   GMM Billing Solutions — Assessment Portal  |  app.js
   All buttons wired via addEventListener — no inline onclick
   ══════════════════════════════════════════════════════ */

'use strict';

// ─── STATE ───────────────────────────────────────────────────
const TEAMS_DEFAULT = ['Charges Team','Payment Team','Analyst Team','Coding Team','AR Team','Management','Operations'];
let GAS_URL     = localStorage.getItem('gmm_gas_url') || '';
let currentUser = null;
let assessments = [];
let currentAID  = null;
let empAnswers  = {};
let lockedQs    = {};
let allResults  = [];
let quizLocked  = false;
let warnCount   = 0;
const MAX_WARNS = 3;
let qType       = 'mcq';
let tfSel       = null;
let ynSel       = null;

// ─── BOOT ─────────────────────────────────────────────────────
window.addEventListener('load', function () {

  // Load saved assessments
  try { assessments = JSON.parse(localStorage.getItem('gmm_assessments') || '[]'); } catch(e) { assessments = []; }
  seedDemoAssessments();

  // Restore session (page refresh)
  const saved = localStorage.getItem('gmm_session');
  if (saved) {
    try { currentUser = JSON.parse(saved); afterLogin(); return; } catch(e) { localStorage.removeItem('gmm_session'); }
  }

  // Wire login page
  const gasInp = document.getElementById('gas-inp');
  if (gasInp && GAS_URL) gasInp.value = GAS_URL;

  document.getElementById('signin-btn').addEventListener('click', doLogin);
  document.getElementById('eye-btn').addEventListener('click', toggleEye);
  document.getElementById('li-email').addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
  document.getElementById('li-pass').addEventListener('keydown',  function(e){ if(e.key==='Enter') doLogin(); });

  // Modal overlays close on backdrop click
  document.querySelectorAll('.movl').forEach(function(ov) {
    ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('open'); });
  });
});

// ─── GOOGLE APPS SCRIPT (JSONP) ───────────────────────────────
function gasCall(data) {
  return new Promise(function(resolve, reject) {
    if (!GAS_URL) { reject(new Error('No Apps Script URL configured')); return; }
    var cbName = '_gmm_' + Date.now() + '_' + Math.floor(Math.random()*9999);
    var url    = GAS_URL
      + '?callback=' + encodeURIComponent(cbName)
      + '&action='   + encodeURIComponent(data.action || '')
      + '&payload='  + encodeURIComponent(JSON.stringify(data));

    var done  = false;
    var timer = setTimeout(function() {
      if(done) return; done=true; cleanup(); reject(new Error('Timeout'));
    }, 12000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      var s = document.getElementById(cbName);
      if (s) s.remove();
    }

    window[cbName] = function(result) {
      if(done) return; done=true; cleanup(); resolve(result);
    };

    var script   = document.createElement('script');
    script.id    = cbName;
    script.src   = url;
    script.onerror = function() { if(done) return; done=true; cleanup(); reject(new Error('Network error')); };
    document.head.appendChild(script);
  });
}

// ─── LOGIN / LOGOUT ───────────────────────────────────────────
async function doLogin() {
  var email = document.getElementById('li-email').value.trim();
  var pass  = document.getElementById('li-pass').value.trim();
  if (!email || !pass) { showErr('Please enter your email and password.'); return; }

  var btn = document.getElementById('signin-btn');
  var txt = document.getElementById('signin-txt');
  btn.disabled = true;
  txt.innerHTML = '<span class="spin"></span> Signing in…';

  var user = null;
  if (GAS_URL) {
    try {
      var r = await gasCall({ action:'login', email:email, password:pass });
      if (r && r.success) { user = r.user; }
      else { btn.disabled=false; txt.textContent='Sign In →'; showErr(r ? r.message : 'Invalid credentials.'); return; }
    } catch(e) {
      user = demoLogin(email, pass);
    }
  } else {
    user = demoLogin(email, pass);
  }

  btn.disabled = false;
  txt.textContent = 'Sign In →';

  if (!user) { showErr('Invalid email or password.'); return; }
  hideErr();
  currentUser = user;
  localStorage.setItem('gmm_session', JSON.stringify(user));
  afterLogin();
}

function demoLogin(email, pass) {
  var demos = [
    { email:'admin@gmmbilling.com',   password:'Admin@123', name:'Admin User',   role:'admin',    department:'Management',   employeeId:'ADM-001' },
    { email:'charges@gmmbilling.com', password:'Charges@1', name:'Alex Johnson', role:'employee', department:'Charges Team', employeeId:'EMP-001' },
    { email:'payment@gmmbilling.com', password:'Payment@1', name:'Sarah Lee',    role:'employee', department:'Payment Team', employeeId:'EMP-002' },
    { email:'analyst@gmmbilling.com', password:'Analyst@1', name:'Raj Patel',    role:'employee', department:'Analyst Team', employeeId:'EMP-003' }
  ];
  return demos.find(function(d){ return d.email.toLowerCase()===email.toLowerCase() && d.password===pass; }) || null;
}

function afterLogin() {
  document.getElementById('pg-login').style.display = 'none';
  var gasInp = document.getElementById('gas-inp');
  if (gasInp && GAS_URL) gasInp.value = GAS_URL;

  if (currentUser.role === 'admin') {
    document.getElementById('pg-admin').classList.add('active');
    document.getElementById('adm-nm').textContent = currentUser.name;
    document.getElementById('adm-av').textContent = currentUser.name[0].toUpperCase();
    var dp = localStorage.getItem('gmm_def_pass');
    var de = localStorage.getItem('gmm_def_email');
    if (dp) document.getElementById('def-pass').value = dp;
    if (de) document.getElementById('def-email').value = de;
    wireAdminButtons();
    renderAssessmentsList();
    populateBuilderSelect();
    populateResultsFilter();
  } else {
    document.getElementById('pg-employee').classList.add('active');
    document.getElementById('emp-nm').textContent = currentUser.name;
    document.getElementById('emp-av').textContent = currentUser.name[0].toUpperCase();
    wireEmployeeButtons();
    loadEmployeeView();
  }
}

function doLogout() {
  disableLock();
  localStorage.removeItem('gmm_session');
  currentUser = null; empAnswers = {}; lockedQs = {}; quizLocked = false; allResults = [];
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('pg-completed').classList.remove('show');
  document.getElementById('pg-login').style.display = 'flex';
  document.getElementById('li-email').value = '';
  document.getElementById('li-pass').value  = '';
  hideErr();
}

function toggleEye() {
  var inp = document.getElementById('li-pass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function showErr(m) { var e=document.getElementById('lerr'); document.getElementById('lerr-msg').textContent=m; e.classList.add('show'); }
function hideErr()  { document.getElementById('lerr').classList.remove('show'); }

// ─── WIRE ADMIN BUTTONS (called once after admin login) ───────
function wireAdminButtons() {
  // Tabs
  document.querySelectorAll('.atab').forEach(function(btn) {
    btn.addEventListener('click', function() { swTab(btn.dataset.tab, btn); });
  });

  // Admin logout
  document.getElementById('adm-logout-btn').addEventListener('click', doLogout);

  // New assessment
  document.getElementById('new-assessment-btn').addEventListener('click', openNewAssessmentModal);

  // Builder selector
  document.getElementById('builder-assessment-sel').addEventListener('change', switchBuilderAssessment);

  // Question type pills
  document.querySelectorAll('.qpill').forEach(function(pill) {
    pill.addEventListener('click', function() { setQT(pill.dataset.qtype, pill); });
  });

  // TF / YN
  document.getElementById('tf-t').addEventListener('click', function(){ pickTF('True'); });
  document.getElementById('tf-f').addEventListener('click', function(){ pickTF('False'); });
  document.getElementById('yn-y').addEventListener('click', function(){ pickYN('Yes'); });
  document.getElementById('yn-n').addEventListener('click', function(){ pickYN('No'); });

  // Explanation toggle
  document.getElementById('f-exp').addEventListener('change', function() {
    document.getElementById('s-exp').classList.toggle('hidden', !this.checked);
  });

  // Choice buttons (delegation)
  document.getElementById('choices-wrap').addEventListener('click', function(e) {
    if (e.target.classList.contains('mc-btn')) markC(e.target);
    if (e.target.classList.contains('rmbtn')) rmC(e.target);
  });
  document.getElementById('add-opt-btn').addEventListener('click', addOpt);

  // Add / clear question
  document.getElementById('add-q-btn').addEventListener('click', addQ);
  document.getElementById('clear-b-btn').addEventListener('click', clearB);

  // Settings
  document.getElementById('save-gas-btn').addEventListener('click', saveGAS);
  document.getElementById('test-gas-btn').addEventListener('click', testGAS);
  document.getElementById('debug-btn').addEventListener('click', debugLogin);
  document.getElementById('save-defaults-btn').addEventListener('click', saveDefaults);

  // Results
  document.getElementById('refresh-results-btn').addEventListener('click', loadResults);
  document.getElementById('res-filter-assessment').addEventListener('change', filterResults);

  // New assessment modal
  document.getElementById('create-assessment-btn').addEventListener('click', createAssessment);
  document.getElementById('cancel-new-btn').addEventListener('click', function(){ closeModal('modal-new-assessment'); });
  document.getElementById('add-team-btn').addEventListener('click', addCustomTeam);

  // Edit assessment modal
  document.getElementById('save-edit-btn').addEventListener('click', saveEditAssessment);
  document.getElementById('cancel-edit-btn').addEventListener('click', function(){ closeModal('modal-edit-assessment'); });
  document.getElementById('add-edit-team-btn').addEventListener('click', addEditCustomTeam);
}

// ─── WIRE EMPLOYEE BUTTONS ────────────────────────────────────
function wireEmployeeButtons() {
  document.getElementById('emp-logout-btn').addEventListener('click', doLogout);
  document.getElementById('comp-exit-btn').addEventListener('click', doLogout);
}

// ─── ADMIN TABS ───────────────────────────────────────────────
function swTab(id, btn) {
  document.querySelectorAll('.atab').forEach(function(t){ t.classList.remove('on'); });
  document.querySelectorAll('.tpane').forEach(function(p){ p.classList.remove('on'); });
  btn.classList.add('on');
  document.getElementById('tp-'+id).classList.add('on');
  if (id==='assessments') renderAssessmentsList();
}

// ─── GAS SETTINGS ─────────────────────────────────────────────
function saveGAS() {
  var v = document.getElementById('gas-inp').value.trim();
  if (!v) { toast('Enter a valid URL','err'); return; }
  if (!v.includes('script.google.com')) { toast('Must be a Google Apps Script URL','err'); return; }
  GAS_URL = v;
  localStorage.setItem('gmm_gas_url', v);
  document.getElementById('gas-status').textContent = '✓ URL saved';
  toast('✓ URL saved!','ok');
}

async function testGAS() {
  var v = document.getElementById('gas-inp').value.trim() || GAS_URL;
  if (!v) { toast('No URL configured','err'); return; }
  var btn = document.getElementById('test-gas-btn');
  btn.textContent='Testing…'; btn.disabled=true;
  try {
    var r = await gasCall({ action:'ping' });
    if (r && r.success) { toast('✅ Connected to Google Sheets!','ok'); document.getElementById('gas-status').textContent='✓ Connected'; }
    else { toast('⚠ '+( r ? r.message : 'Unknown'),'err'); }
  } catch(e) {
    toast('❌ '+e.message,'err');
    document.getElementById('gas-status').textContent = '✗ '+e.message;
  }
  btn.textContent='🔌 Test Connection'; btn.disabled=false;
}

async function debugLogin() {
  var email = prompt('Email to debug:', 'admin@gmmbilling.com');
  var pass  = prompt('Password:', '');
  if (!email) return;
  try {
    var r = await gasCall({ action:'debug', email:email, password:pass||'' });
    var msg = JSON.stringify(r, null, 2);
    console.log('DEBUG:', r);
    alert(msg.substring(0, 1500));
  } catch(e) { alert('Debug failed: '+e.message); }
}

function saveDefaults() {
  var p = document.getElementById('def-pass').value;
  var e = document.getElementById('def-email').value.trim();
  if (p) localStorage.setItem('gmm_def_pass', p);
  if (e) localStorage.setItem('gmm_def_email', e);
  toast('✓ Defaults saved','ok');
}

// ─── ASSESSMENTS LIST ─────────────────────────────────────────
function renderAssessmentsList() {
  var el = document.getElementById('assessments-list');
  if (!assessments.length) {
    el.innerHTML = '<div class="empty"><div class="ei">📋</div><p>No assessments yet. Click "＋ New Assessment".</p></div>';
    return;
  }
  el.innerHTML = assessments.map(function(a) {
    var qc = (a.questions||[]).length;
    return '<div class="acard" data-aid="'+a.id+'">'
      +'<div class="acard-icon">'+getAIcon(a.title)+'</div>'
      +'<div class="acard-body">'
      +'<div class="acard-title">'+a.title+'</div>'
      +'<div class="acard-meta">'
      +'<span class="chip ch-blue">'+qc+' Question'+(qc!==1?'s':'')+'</span>'
      +'<span class="chip ch-gold">Pass: '+a.passingScore+'%</span>'
      +'<span class="chip '+(a.published?'ch-green':'ch-gray')+'">'+(a.published?'✓ Published':'Draft')+'</span>'
      +'</div>'
      +'<div class="acard-teams">'+(a.teams&&a.teams.length?'🏢 '+a.teams.join(' · '):'<span style="color:var(--g500)">No teams assigned</span>')+'</div>'
      +'</div>'
      +'<div class="acard-actions">'
      +'<button class="btn b-blue b-sm pub-btn" data-aid="'+a.id+'">'+(a.published?'Unpublish':'Publish')+'</button>'
      +'<button class="btn b-red b-sm del-btn"  data-aid="'+a.id+'">Delete</button>'
      +'</div>'
      +'</div>';
  }).join('');

  // Wire card buttons
  el.querySelectorAll('.acard').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.classList.contains('pub-btn') || e.target.classList.contains('del-btn')) return;
      openEditModal(card.dataset.aid);
    });
  });
  el.querySelectorAll('.pub-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e){ e.stopPropagation(); togglePublish(btn.dataset.aid); });
  });
  el.querySelectorAll('.del-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e){ e.stopPropagation(); deleteAssessment(btn.dataset.aid); });
  });
}

function getAIcon(t) {
  t = (t||'').toLowerCase();
  if(t.includes('charge'))  return '💰';
  if(t.includes('payment')) return '💳';
  if(t.includes('analyst')) return '📊';
  if(t.includes('coding'))  return '🔤';
  if(t.includes('ar'))      return '📁';
  return '📋';
}

// ─── NEW / EDIT ASSESSMENT ─────────────────────────────────────
function openNewAssessmentModal() {
  document.getElementById('na-title').value = '';
  document.getElementById('na-desc').value  = '';
  document.getElementById('na-pass').value  = localStorage.getItem('gmm_def_pass') || 70;
  document.getElementById('na-email').value = localStorage.getItem('gmm_def_email') || '';
  renderTeamCBs('team-checkboxes', []);
  openModal('modal-new-assessment');
}

function openEditModal(aid) {
  var a = assessments.find(function(x){ return x.id===aid; });
  if (!a) return;
  document.getElementById('edit-aid').value            = aid;
  document.getElementById('edit-modal-title').textContent = 'Edit: '+a.title;
  document.getElementById('edit-title').value          = a.title;
  document.getElementById('edit-desc').value           = a.desc||'';
  document.getElementById('edit-pass').value           = a.passingScore||70;
  document.getElementById('edit-email').value          = a.mgmtEmail||'';
  renderTeamCBs('edit-team-checkboxes', a.teams||[]);
  openModal('modal-edit-assessment');
}

function renderTeamCBs(containerId, selected) {
  var all = new Set(TEAMS_DEFAULT);
  assessments.forEach(function(a){ (a.teams||[]).forEach(function(t){ all.add(t); }); });
  document.getElementById(containerId).innerHTML = Array.from(all).map(function(t) {
    var on = selected.indexOf(t)>-1;
    return '<label class="team-cb '+(on?'on':'')+'">'
      +'<input type="checkbox" value="'+t+'" '+(on?'checked':'')+'>'+t+'</label>';
  }).join('');
  document.getElementById(containerId).querySelectorAll('input').forEach(function(inp) {
    inp.addEventListener('change', function(){ inp.closest('.team-cb').classList.toggle('on', inp.checked); });
  });
}

function getCheckedTeams(containerId) {
  return Array.from(document.querySelectorAll('#'+containerId+' input:checked')).map(function(i){ return i.value; });
}

function addCustomTeam() {
  var inp = document.getElementById('new-team-inp');
  var v   = inp.value.trim(); if(!v) return;
  addTeamToContainer('team-checkboxes', v); inp.value='';
}

function addEditCustomTeam() {
  var inp = document.getElementById('edit-new-team-inp');
  var v   = inp.value.trim(); if(!v) return;
  addTeamToContainer('edit-team-checkboxes', v); inp.value='';
}

function addTeamToContainer(containerId, name) {
  var el  = document.getElementById(containerId);
  var lbl = document.createElement('label');
  lbl.className = 'team-cb on';
  lbl.innerHTML = '<input type="checkbox" value="'+name+'" checked>'+name;
  lbl.querySelector('input').addEventListener('change', function(e){ lbl.classList.toggle('on', e.target.checked); });
  el.appendChild(lbl);
}

function createAssessment() {
  var title = document.getElementById('na-title').value.trim();
  if (!title) { toast('Enter a title','err'); return; }
  var a = {
    id: 'a_'+Date.now(), title: title,
    desc:         document.getElementById('na-desc').value.trim(),
    passingScore: parseInt(document.getElementById('na-pass').value)||70,
    mgmtEmail:    document.getElementById('na-email').value.trim(),
    teams:        getCheckedTeams('team-checkboxes'),
    questions:[], published:false, createdAt:new Date().toISOString()
  };
  assessments.push(a); saveAssessments();
  closeModal('modal-new-assessment');
  renderAssessmentsList(); populateBuilderSelect(); populateResultsFilter();
  toast('✓ "'+title+'" created','ok');
}

function saveEditAssessment() {
  var aid = document.getElementById('edit-aid').value;
  var a   = assessments.find(function(x){ return x.id===aid; }); if(!a) return;
  var title = document.getElementById('edit-title').value.trim();
  if (!title) { toast('Title required','err'); return; }
  a.title        = title;
  a.desc         = document.getElementById('edit-desc').value.trim();
  a.passingScore = parseInt(document.getElementById('edit-pass').value)||70;
  a.mgmtEmail    = document.getElementById('edit-email').value.trim();
  a.teams        = getCheckedTeams('edit-team-checkboxes');
  saveAssessments();
  closeModal('modal-edit-assessment');
  renderAssessmentsList(); populateBuilderSelect(); populateResultsFilter();
  toast('✓ Assessment updated','ok');
}

function togglePublish(aid) {
  var a = assessments.find(function(x){ return x.id===aid; }); if(!a) return;
  if (!a.published && !a.questions.length) { toast('Add questions first','err'); return; }
  if (!a.published && !a.teams.length)     { toast('Assign a team first','err'); return; }
  a.published = !a.published;
  saveAssessments(); renderAssessmentsList();
  toast(a.published ? '✓ "'+a.title+'" is live' : '"'+a.title+'" unpublished','ok');
}

function deleteAssessment(aid) {
  assessments = assessments.filter(function(a){ return a.id!==aid; });
  saveAssessments(); renderAssessmentsList(); populateBuilderSelect(); populateResultsFilter();
  if (currentAID===aid) { currentAID=null; renderQList(); }
  toast('Assessment deleted','ok');
}

// ─── QUESTION BUILDER ─────────────────────────────────────────
function populateBuilderSelect() {
  var sel = document.getElementById('builder-assessment-sel');
  sel.innerHTML = '<option value="">-- Select Assessment --</option>';
  assessments.forEach(function(a) {
    var o = document.createElement('option'); o.value=a.id; o.textContent=a.title;
    if (a.id===currentAID) o.selected=true;
    sel.appendChild(o);
  });
}

function switchBuilderAssessment() {
  currentAID = document.getElementById('builder-assessment-sel').value || null;
  var a = currentAID ? assessments.find(function(x){ return x.id===currentAID; }) : null;
  document.getElementById('builder-for-label').textContent = a ? 'Building: '+a.title : 'Select an assessment first';
  renderQList();
}

function setQT(t, btn) {
  qType = t;
  document.querySelectorAll('.qpill').forEach(function(p){ p.classList.remove('on'); });
  btn.classList.add('on');
  document.getElementById('s-mcq').classList.toggle('hidden',  !['mcq','multi'].includes(t));
  document.getElementById('s-tf').classList.toggle('hidden',   t!=='tf');
  document.getElementById('s-yn').classList.toggle('hidden',   t!=='yn');
  document.getElementById('s-text').classList.toggle('hidden', t!=='text');
}

function markC(btn) {
  if (qType!=='multi') document.querySelectorAll('#choices-wrap .mc-btn').forEach(function(b){ b.classList.remove('on'); });
  btn.classList.toggle('on');
}

function addOpt() {
  var wrap = document.getElementById('choices-wrap');
  var idx  = wrap.children.length;
  var labs = 'ABCDEFGHIJ';
  var row  = document.createElement('div'); row.className='crow';
  row.innerHTML = '<button class="mc-btn" type="button">✓</button><input class="cinp" placeholder="Option '+(labs[idx]||idx+1)+'"><button class="rmbtn" type="button">×</button>';
  row.querySelector('.mc-btn').addEventListener('click', function(){ markC(row.querySelector('.mc-btn')); });
  row.querySelector('.rmbtn').addEventListener('click', function(){ rmC(row.querySelector('.rmbtn')); });
  wrap.appendChild(row);
}

function rmC(btn) {
  if (document.getElementById('choices-wrap').children.length>2) btn.closest('.crow').remove();
  else toast('Need at least 2 options','err');
}

function pickTF(v) {
  tfSel=v;
  document.getElementById('tf-t').classList.toggle('sel', v==='True');
  document.getElementById('tf-f').classList.toggle('sel', v==='False');
}

function pickYN(v) {
  ynSel=v;
  document.getElementById('yn-y').classList.toggle('sel', v==='Yes');
  document.getElementById('yn-n').classList.toggle('sel', v==='No');
}

function addQ() {
  if (!currentAID) { toast('Select an assessment first','err'); return; }
  var a    = assessments.find(function(x){ return x.id===currentAID; });
  var text = document.getElementById('q-text').value.trim();
  if (!text) { toast('Enter question text','err'); return; }

  var q = {
    id:Date.now(), text:text, type:qType,
    mandatory:    document.getElementById('f-mand').checked,
    points:       parseInt(document.getElementById('f-pts').value)||1,
    explanation:  document.getElementById('f-exp').checked ? document.getElementById('exp-txt').value.trim() : '',
    options:[], correctAnswers:[], correctAnswer:null
  };

  if (['mcq','multi'].includes(qType)) {
    document.querySelectorAll('#choices-wrap .crow').forEach(function(row) {
      var val = row.querySelector('.cinp').value.trim();
      if (val) {
        q.options.push(val);
        if (row.querySelector('.mc-btn').classList.contains('on')) q.correctAnswers.push(q.options.length-1);
      }
    });
    if (q.options.length<2)        { toast('Add at least 2 options','err'); return; }
    if (!q.correctAnswers.length)  { toast('Mark a correct answer','err'); return; }
  } else if (qType==='tf') {
    if (!tfSel) { toast('Select True or False','err'); return; }
    q.options=['True','False']; q.correctAnswer=tfSel;
  } else if (qType==='yn') {
    if (!ynSel) { toast('Select Yes or No','err'); return; }
    q.options=['Yes','No']; q.correctAnswer=ynSel;
  } else {
    q.correctAnswer = document.getElementById('text-key').value.trim();
  }

  a.questions.push(q);
  saveAssessments(); renderQList(); clearB();
  toast('✓ Question added','ok');
}

function clearB() {
  document.getElementById('q-text').value  = '';
  document.getElementById('f-pts').value   = 1;
  document.getElementById('f-mand').checked = false;
  document.getElementById('f-exp').checked  = false;
  document.getElementById('exp-txt').value  = '';
  document.getElementById('s-exp').classList.add('hidden');
  document.getElementById('text-key').value = '';
  tfSel=null; ynSel=null;
  document.querySelectorAll('#choices-wrap .mc-btn').forEach(function(b){ b.classList.remove('on'); });
  ['tf-t','tf-f','yn-y','yn-n'].forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove('sel'); });
}

function renderQList() {
  var el  = document.getElementById('q-list');
  var lbl = document.getElementById('q-count-lbl');
  var a   = currentAID ? assessments.find(function(x){ return x.id===currentAID; }) : null;
  var qs  = a ? a.questions : [];
  lbl.textContent = qs.length+' question'+(qs.length!==1?'s':'');
  if (!qs.length) { el.innerHTML='<div class="empty"><div class="ei">❓</div><p>No questions yet.</p></div>'; return; }
  var types = {mcq:'MCQ',multi:'Multi-Select',tf:'True/False',yn:'Yes/No',text:'Short Answer'};
  el.innerHTML = qs.map(function(q,i) {
    return '<div class="qi">'
      +'<div class="qnum">Q'+(i+1)+'</div>'
      +'<div class="qbody">'
      +'<div class="qtxt">'+q.text+(q.mandatory?'<span class="mstar">*</span>':'')+'</div>'
      +'<div class="qchips">'
      +'<span class="chip ch-blue">'+(types[q.type]||q.type)+'</span>'
      +'<span class="chip ch-gold">'+q.points+'pt'+(q.points>1?'s':'')+'</span>'
      +(q.explanation?'<span class="chip ch-green">Explanation</span>':'')
      +'</div></div>'
      +'<button class="qdel" type="button" data-aid="'+a.id+'" data-idx="'+i+'">×</button>'
      +'</div>';
  }).join('');
  el.querySelectorAll('.qdel').forEach(function(btn) {
    btn.addEventListener('click', function(){ deleteQ(btn.dataset.aid, parseInt(btn.dataset.idx)); });
  });
}

function deleteQ(aid, idx) {
  var a = assessments.find(function(x){ return x.id===aid; }); if(!a) return;
  a.questions.splice(idx,1); saveAssessments(); renderQList();
  toast('Question removed','ok');
}

// ─── RESULTS ──────────────────────────────────────────────────
function populateResultsFilter() {
  var sel = document.getElementById('res-filter-assessment');
  sel.innerHTML = '<option value="">All Assessments</option>';
  assessments.forEach(function(a) {
    var o=document.createElement('option'); o.value=a.id; o.textContent=a.title; sel.appendChild(o);
  });
}

async function loadResults() {
  var el = document.getElementById('results-area');
  if (!GAS_URL) { el.innerHTML='<div class="empty"><div class="ei">🔗</div><p>Configure Apps Script URL in Settings first.</p></div>'; return; }
  el.innerHTML='<div class="empty"><div class="ei"><span class="spin"></span></div><p>Loading…</p></div>';
  try {
    var res = await gasCall({ action:'getResults' });
    allResults = res.results||[];
    renderResultsTable(allResults);
  } catch(e) {
    el.innerHTML='<div class="empty"><div class="ei">⚠</div><p>Failed: '+e.message+'</p></div>';
  }
}

function filterResults() {
  var aid = document.getElementById('res-filter-assessment').value;
  var a   = aid ? assessments.find(function(x){ return x.id===aid; }) : null;
  renderResultsTable(a ? allResults.filter(function(r){ return r.assessmentTitle===a.title; }) : allResults);
}

function renderResultsTable(data) {
  var el = document.getElementById('results-area');
  if (!data.length) { el.innerHTML='<div class="empty"><div class="ei">📊</div><p>No results yet.</p></div>'; return; }
  var rows = data.map(function(r) {
    var tot = (parseInt(r.correct)||0)+(parseInt(r.wrong)||0)+(parseInt(r.skipped)||0);
    return '<tr>'
      +'<td><div style="font-weight:600">'+( r.employeeName||'—')+'</div><div style="font-size:11px;color:var(--g500)">'+(r.employeeEmail||'')+'</div></td>'
      +'<td style="color:var(--g300)">'+(r.department||'—')+'</td>'
      +'<td>'+(r.assessmentTitle||'—')+'</td>'
      +'<td><strong style="color:var(--blue-lt);font-size:15px">'+(r.score||0)+'%</strong></td>'
      +'<td><span class="pb '+(r.passed==='Pass'?'p':'f')+'">'+(r.passed||'—')+'</span></td>'
      +'<td>'+(r.correct||0)+' / '+tot+'</td>'
      +'<td style="color:var(--g500);font-size:11px">'+(r.submittedAt||'—')+'</td>'
      +'</tr>';
  }).join('');
  el.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">'
    +'<button class="btn b-gold b-sm" type="button" id="export-btn">⬇ Export to Excel</button></div>'
    +'<div class="rtw"><table class="rt"><thead><tr>'
    +'<th>Employee</th><th>Dept</th><th>Assessment</th><th>Score</th><th>Result</th><th>Correct</th><th>Submitted</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table></div>';
  document.getElementById('export-btn').addEventListener('click', exportExcel);
}

function exportExcel() {
  if (!allResults.length) { toast('No results to export','err'); return; }
  var headers = ['Employee Name','Employee Email','Employee ID','Department','Assessment Title','Score (%)','Earned Points','Total Points','Result','Correct','Wrong','Skipped','Submitted At','Manager Email'];
  function esc(v) {
    var s = (v===null||v===undefined)?'':String(v);
    return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }
  var rows = allResults.map(function(r) {
    return [r.employeeName,r.employeeEmail,r.employeeId,r.department,r.assessmentTitle,r.score,r.earnedPoints,r.totalPoints,r.passed,r.correct,r.wrong,r.skipped,r.submittedAt,r.mgmtEmail].map(esc).join(',');
  });
  var csv  = [headers.map(esc).join(',')].concat(rows).join('\r\n');
  var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url; a.download='GMM_Results_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('✓ Excel file downloaded!','ok');
}

// ─── PERSIST ──────────────────────────────────────────────────
function saveAssessments() {
  try { localStorage.setItem('gmm_assessments', JSON.stringify(assessments)); } catch(e){}
}

// ─── EMPLOYEE QUIZ ────────────────────────────────────────────
function loadEmployeeView() {
  var area  = document.getElementById('emp-quiz-area');
  var dept  = (currentUser.department||'').trim();
  var email = currentUser.email;
  var assigned = assessments.filter(function(a) {
    return a.published && (a.teams||[]).some(function(t){ return t.toLowerCase()===dept.toLowerCase(); });
  });
  if (!assigned.length) {
    area.innerHTML='<div class="not-assigned"><div class="icon">🔒</div><h2>No Assessment Assigned</h2><p>No assessments for your team (<strong>'+dept+'</strong>) right now.</p></div>';
    return;
  }
  var todo = assigned.filter(function(a){ return !localStorage.getItem('gmm_done_'+email+'_'+a.id); });
  if (!todo.length) {
    area.innerHTML='<div class="already-done"><div class="icon">✅</div><h2>Assessment Already Completed</h2><p>You have completed all your assigned assessments.</p><div style="margin-top:28px;"><button class="btn b-ghost" type="button" id="done-logout">Exit</button></div></div>';
    document.getElementById('done-logout').addEventListener('click', doLogout);
    return;
  }
  startQuiz(todo[0]);
}

function startQuiz(a) {
  empAnswers={}; lockedQs={};
  enableLock();
  var area  = document.getElementById('emp-quiz-area');
  var total = a.questions.reduce(function(s,q){ return s+q.points; }, 0);
  var labs  = 'ABCDEFGH';
  var hints = {mcq:'Choose one answer',multi:'Select all that apply',tf:'True or False — locked after selection',yn:'Yes or No — locked after selection',text:'Type your answer'};

  area.innerHTML = '<div class="qhd">'
    +'<h1>'+a.title+'</h1>'
    +'<p style="color:var(--g300);font-size:13px;">'+(a.desc||'Read carefully and answer.')+'</p>'
    +'<div class="qmeta">'
    +'<div class="qmi">📋 '+a.questions.length+' Questions</div>'
    +'<div class="qmi">🏅 '+total+' Points</div>'
    +'<div class="qmi">✅ Pass: '+a.passingScore+'%</div>'
    +'<div class="qmi" style="color:#ff8080;">🔒 One attempt — stay on this tab</div>'
    +'</div></div>'
    +'<div class="pbar"><div class="pfill" id="ep-prog" style="width:0%"></div></div>'
    +'<div id="eq-qs"></div>'
    +'<div class="subbox">'
    +'<h3>Submit Assessment</h3>'
    +'<p>Once submitted, results are sent to the manager.</p>'
    +'<div class="cpl-row"><span style="font-size:12px;color:var(--g300);">Answered:</span>'
    +'<div class="cpl-bar"><div class="cpl-fill" id="ep-cfill" style="width:0%"></div></div>'
    +'<span class="cpl-lbl" id="ep-clbl">0 / '+a.questions.length+'</span></div>'
    +'<button class="btn b-gold b-full" type="button" id="submit-emp-btn" data-aid="'+a.id+'" style="font-size:15px;padding:15px;">'
    +'📤 Submit &amp; Send Results to Manager</button></div>';

  var qContainer = document.getElementById('eq-qs');
  qContainer.innerHTML = a.questions.map(function(q,qi) {
    var opts='';
    if (['mcq','multi'].includes(q.type)) {
      opts='<div class="opts">'+q.options.map(function(o,oi) {
        return '<button class="opt" type="button" id="op-'+qi+'-'+oi+'" data-qi="'+qi+'" data-oi="'+oi+'" data-type="'+q.type+'" data-aid="'+a.id+'">'
          +'<div class="odot">'+(labs[oi]||oi)+'</div>'+o+'</button>';
      }).join('')+'</div>';
    } else if (q.type==='tf'||q.type==='yn') {
      var o=q.type==='tf'?['True','False']:['Yes','No'];
      var ic=q.type==='tf'?['T','F']:['Y','N'];
      opts='<div class="tf-row">'+o.map(function(v,oi) {
        return '<button class="opt" type="button" id="op-'+qi+'-'+oi+'" data-qi="'+qi+'" data-oi="'+oi+'" data-type="single" data-aid="'+a.id+'">'
          +'<div class="odot">'+ic[oi]+'</div>'+v+'</button>';
      }).join('')+'</div>';
    } else {
      opts='<textarea class="tans" id="ta-'+qi+'" data-qi="'+qi+'" data-aid="'+a.id+'" placeholder="Type your answer here…"></textarea>';
    }
    return '<div class="qcard" id="qc-'+qi+'">'
      +'<div class="qctop">'
      +'<div class="qnb">Q'+(qi+1)+' · '+q.points+'pt'+(q.points>1?'s':'')+'</div>'
      +'<div class="qqtxt">'+q.text+(q.mandatory?'<span class="mstar">*</span>':'')+'</div>'
      +'</div>'
      +'<div class="qhint">'+(hints[q.type]||'')+'</div>'
      +opts+'</div>';
  }).join('');

  // Wire answer buttons
  qContainer.querySelectorAll('.opt[data-qi]').forEach(function(btn) {
    btn.addEventListener('click', function(){ pick(parseInt(btn.dataset.qi), parseInt(btn.dataset.oi), btn.dataset.type, btn.dataset.aid); });
  });
  qContainer.querySelectorAll('textarea.tans').forEach(function(ta) {
    ta.addEventListener('input', function(){ pickText(parseInt(ta.dataset.qi), ta.value, ta.dataset.aid); });
  });

  document.getElementById('submit-emp-btn').addEventListener('click', function(){
    submitEmp(a.id);
  });
}

function pick(qi, oi, type, aid) {
  if (lockedQs[qi]) { toast('Answer locked — cannot change','err'); return; }
  if (!empAnswers[qi]) empAnswers[qi]=[];
  if (type==='multi') {
    var x=empAnswers[qi].indexOf(oi);
    if(x>-1) empAnswers[qi].splice(x,1); else empAnswers[qi].push(oi);
  } else {
    empAnswers[qi]=[oi]; lockedQs[qi]=true;
    var a=assessments.find(function(x){ return x.id===aid; });
    if(a)(a.questions[qi].options||[]).forEach(function(_,i){
      var b=document.getElementById('op-'+qi+'-'+i);
      if(b){b.classList.add('locked'); b.setAttribute('title','Answer locked');}
    });
  }
  var a2=assessments.find(function(x){ return x.id===aid; });
  if(a2)(a2.questions[qi].options||[]).forEach(function(_,i){
    var b=document.getElementById('op-'+qi+'-'+i);
    if(b) b.classList.toggle('sel', empAnswers[qi].includes(i));
  });
  var qc=document.getElementById('qc-'+qi);
  if(qc) qc.classList.toggle('done', empAnswers[qi].length>0);
  updateProg(aid);
}

function pickText(qi,v,aid) {
  empAnswers[qi]=v.trim()?[v.trim()]:[];
  var qc=document.getElementById('qc-'+qi); if(qc) qc.classList.toggle('done',v.trim().length>0);
  updateProg(aid);
}

function updateProg(aid) {
  var a=assessments.find(function(x){ return x.id===aid; }); if(!a) return;
  var tot=a.questions.length;
  var ans=Object.keys(empAnswers).filter(function(k){ return empAnswers[k]&&empAnswers[k].length>0; }).length;
  var p=tot?(ans/tot)*100:0;
  var prog=document.getElementById('ep-prog'); if(prog) prog.style.width=p+'%';
  var fill=document.getElementById('ep-cfill'); if(fill) fill.style.width=p+'%';
  var lbl=document.getElementById('ep-clbl');   if(lbl)  lbl.textContent=ans+' / '+tot;
}

async function submitEmp(aid) {
  var a=assessments.find(function(x){ return x.id===aid; }); if(!a) return;
  var qs=a.questions;
  var missing=qs.filter(function(q,i){ return q.mandatory&&(!empAnswers[i]||!empAnswers[i].length); });
  if(missing.length){ toast('⚠ Answer all mandatory (*) questions — '+missing.length+' remaining','err'); return; }

  var btn=document.getElementById('submit-emp-btn');
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="spin"></span> Submitting…'; }

  var earned=0,total=0,correct=0,wrong=0,skipped=0;
  qs.forEach(function(q,qi) {
    total+=q.points;
    var ans=empAnswers[qi]||[]; var has=ans.length>0; var ok=false;
    if(['mcq','multi'].includes(q.type)){
      ok=has&&[].concat(ans).sort().join()===[].concat(q.correctAnswers).sort().join();
    } else if(q.type==='tf'||q.type==='yn'){
      var opts=q.type==='tf'?['True','False']:['Yes','No'];
      ok=has&&opts[ans[0]]===q.correctAnswer;
    } else {
      ok=has&&(q.correctAnswer?(ans[0]||'').toLowerCase().includes(q.correctAnswer.toLowerCase()):has);
    }
    if(!has) skipped++; else if(ok){correct++;earned+=q.points;} else wrong++;
  });

  var pct=total?Math.round((earned/total)*100):0;
  var passed=pct>=a.passingScore;

  var payload={
    action:'saveResult',
    employeeName:currentUser.name, employeeEmail:currentUser.email,
    employeeId:currentUser.employeeId||'', department:currentUser.department||'',
    assessmentId:a.id, assessmentTitle:a.title,
    score:pct, earnedPoints:earned, totalPoints:total,
    passed:passed?'Pass':'Fail', correct:correct, wrong:wrong, skipped:skipped,
    submittedAt:new Date().toLocaleString(), mgmtEmail:a.mgmtEmail||''
  };

  if(GAS_URL){ try{ await gasCall(payload); }catch(e){ console.warn('Save failed:',e.message); } }

  localStorage.setItem('gmm_done_'+currentUser.email+'_'+a.id, JSON.stringify({pct:pct,passed:passed}));
  disableLock();

  document.getElementById('pg-employee').classList.remove('active');
  document.getElementById('comp-sub-txt').textContent='Your responses have been recorded and sent to the manager. Thank you!';
  document.getElementById('pg-completed').classList.add('show');
}

// ─── ANTI-CHEAT LOCK ──────────────────────────────────────────
function enableLock() {
  quizLocked=true; warnCount=0;
  document.addEventListener('visibilitychange', onVisChange);
  window.addEventListener('blur', onBlur);
  document.addEventListener('contextmenu', blockCtx);
  document.addEventListener('keydown', blockKeys);
  window.addEventListener('beforeunload', onUnload);
}

function disableLock() {
  quizLocked=false;
  document.removeEventListener('visibilitychange', onVisChange);
  window.removeEventListener('blur', onBlur);
  document.removeEventListener('contextmenu', blockCtx);
  document.removeEventListener('keydown', blockKeys);
  window.removeEventListener('beforeunload', onUnload);
}

function onVisChange() {
  if(!quizLocked||!document.hidden) return;
  warnCount++; showWarn('⚠ You switched tabs!');
}
function onBlur() {
  if(!quizLocked) return;
  setTimeout(function(){
    if(!quizLocked||document.hasFocus()) return;
    warnCount++; showWarn('⚠ You clicked outside the assessment window!');
  }, 400);
}
function blockCtx(e){ if(quizLocked){ e.preventDefault(); return false; } }
function blockKeys(e){
  if(!quizLocked) return;
  if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&'IJC'.includes(e.key.toUpperCase()))||(e.altKey&&e.key==='Tab')||e.key==='PrintScreen'){
    e.preventDefault(); return false;
  }
}
function onUnload(e){ if(quizLocked){ e.preventDefault(); e.returnValue='You are in the middle of an assessment!'; return e.returnValue; } }

function showWarn(msg) {
  var old=document.getElementById('ac-overlay'); if(old) old.remove();
  var ov=document.createElement('div');
  ov.id='ac-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(6,13,26,0.97);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:30px;';
  var remaining=MAX_WARNS-warnCount;
  if(warnCount>=MAX_WARNS){
    ov.innerHTML='<div style="font-size:56px;margin-bottom:20px;">🚫</div>'
      +'<div style="font-family:\'Playfair Display\',serif;font-size:28px;color:#ff4d4d;margin-bottom:12px;">Assessment Terminated</div>'
      +'<div style="font-size:15px;color:#8899bb;max-width:440px;line-height:1.7;margin-bottom:28px;">You switched away '+MAX_WARNS+' times. Your session has been ended.</div>'
      +'<button id="ac-exit" type="button" style="background:linear-gradient(135deg,#ff4d4d,#ff8080);border:none;border-radius:11px;padding:13px 36px;color:#fff;font-family:Outfit,sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Exit Assessment</button>';
    document.body.appendChild(ov);
    document.getElementById('ac-exit').addEventListener('click', function(){ disableLock(); ov.remove(); doLogout(); });
  } else {
    ov.innerHTML='<div style="font-size:56px;margin-bottom:20px;">⚠️</div>'
      +'<div style="font-family:\'Playfair Display\',serif;font-size:26px;color:#f5c842;margin-bottom:12px;">Warning '+warnCount+' of '+MAX_WARNS+'</div>'
      +'<div style="font-size:15px;color:#8899bb;max-width:440px;line-height:1.7;margin-bottom:8px;">'+msg+'</div>'
      +'<div style="font-size:13px;color:#ff8080;margin-bottom:28px;">'+remaining+' warning'+(remaining!==1?'s':'')+' left before termination.</div>'
      +'<button id="ac-return" type="button" style="background:linear-gradient(135deg,#1a6fff,#4d8fff);border:none;border-radius:11px;padding:13px 36px;color:#fff;font-family:Outfit,sans-serif;font-size:15px;font-weight:700;cursor:pointer;">Return to Assessment</button>';
    document.body.appendChild(ov);
    document.getElementById('ac-return').addEventListener('click', function(){ ov.remove(); window.focus(); });
  }
}

// ─── MODAL / TOAST ────────────────────────────────────────────
function openModal(id){  document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

function toast(msg,type){
  type=type||'ok';
  var el=document.getElementById('toast');
  document.getElementById('t-msg').textContent=msg;
  document.getElementById('t-ico').textContent=type==='ok'?'✓':'⚠';
  el.className='toast '+type+' show';
  clearTimeout(window._tt);
  window._tt=setTimeout(function(){ el.className='toast '+type; },3500);
}

// ─── SEED DEMO DATA ───────────────────────────────────────────
function seedDemoAssessments() {
  if(assessments.length) return;
  assessments=[
    { id:'a_demo1',title:'Charges Team — Medical Billing Fundamentals',desc:'Test your knowledge of charge entry, CPT codes, and billing workflows.',
      passingScore:70,mgmtEmail:'manager@gmmbilling.com',teams:['Charges Team'],published:true,createdAt:new Date().toISOString(),
      questions:[
        {id:1,text:'What does CPT stand for?',type:'mcq',mandatory:true,points:2,explanation:'CPT = Current Procedural Terminology',
         options:['Current Patient Treatment','Current Procedural Terminology','Certified Payment Terms','Clinical Processing Tools'],correctAnswers:[1],correctAnswer:null},
        {id:2,text:'Which form is used for professional/outpatient billing?',type:'mcq',mandatory:true,points:2,explanation:'CMS-1500 is the standard professional claim form.',
         options:['UB-04','CMS-1450','CMS-1500','ADA Form'],correctAnswers:[2],correctAnswer:null},
        {id:3,text:'A charge entry must be completed within 24 hours of the patient visit.',type:'tf',mandatory:false,points:1,explanation:'Timely charge entry is critical.',
         options:['True','False'],correctAnswers:[],correctAnswer:'True'}
      ]
    },
    { id:'a_demo2',title:'Payment Team — EOB & Remittance',desc:'Assessment on EOB reading and payment posting.',
      passingScore:75,mgmtEmail:'manager@gmmbilling.com',teams:['Payment Team'],published:true,createdAt:new Date().toISOString(),
      questions:[
        {id:4,text:'What does EOB stand for?',type:'mcq',mandatory:true,points:2,explanation:'EOB = Explanation of Benefits.',
         options:['Estimate of Benefits','Explanation of Benefits','Evidence of Billing','Entry of Balance'],correctAnswers:[1],correctAnswer:null},
        {id:5,text:'Does Medicare Part B cover inpatient hospital stays?',type:'yn',mandatory:true,points:1,explanation:'Part A covers inpatient; Part B covers outpatient.',
         options:['Yes','No'],correctAnswers:[],correctAnswer:'No'}
      ]
    },
    { id:'a_demo3',title:'Analyst Team — Revenue Cycle Analytics',desc:'Advanced assessment on KPIs and denial trends.',
      passingScore:80,mgmtEmail:'manager@gmmbilling.com',teams:['Analyst Team'],published:true,createdAt:new Date().toISOString(),
      questions:[
        {id:6,text:'What is the standard clean claim timeframe for Medicare?',type:'mcq',mandatory:true,points:2,explanation:'Medicare requires claims within 12 months.',
         options:['90 days','6 months','12 months','24 months'],correctAnswers:[2],correctAnswer:null},
        {id:7,text:'A denial rate above 10% is generally acceptable in RCM.',type:'tf',mandatory:false,points:1,explanation:'Best practice is under 5%.',
         options:['True','False'],correctAnswers:[],correctAnswer:'False'}
      ]
    }
  ];
  saveAssessments();
}
