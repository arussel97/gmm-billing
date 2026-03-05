/**
 * GMM Billing Solutions — Assessment Portal
 * GoogleAppsScript.gs
 *
 * HOW TO DEPLOY:
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire file, replacing all existing code
 * 3. Set SPREADSHEET_ID below (get it from your Google Sheet URL)
 * 4. Click Save (Ctrl+S)
 * 5. Click Deploy → New Deployment
 *    - Type: Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Click Deploy → Authorize → Allow
 * 7. Copy the Web App URL and paste into your portal Settings tab
 *
 * SPREADSHEET SETUP:
 * Create two tabs named exactly: "Users" and "Results"
 * Users tab columns: email | password | name | role | department | employeeId | active
 * Results tab: auto-created on first submission
 */

var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';  // ← REPLACE THIS
var SHEET_USERS    = 'Users';
var SHEET_RESULTS  = 'Results';

// ─── ALL REQUESTS COME THROUGH doGet (JSONP for CORS) ──────────
function doGet(e) {
  var params   = e.parameter || {};
  var callback = params.callback || 'callback';
  var action   = params.action  || '';
  var payload  = params.payload || '';

  var data = {};
  if (payload) {
    try { data = JSON.parse(decodeURIComponent(payload)); } catch(err) { data = {}; }
  }
  if (!data.action && action) data.action = action;

  var result = route(data);
  var output = callback + '(' + JSON.stringify(result) + ');';

  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// POST support (optional, for future use)
function doPost(e) {
  var data = {};
  try {
    var body = e.postData ? e.postData.contents : '{}';
    data = JSON.parse(body);
  } catch(err) { data = {}; }

  var result = route(data);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── ROUTER ────────────────────────────────────────────────────
function route(data) {
  var action = String(data.action || '').trim();
  try {
    if (action === 'ping')       return ping();
    if (action === 'login')      return login(data);
    if (action === 'saveResult') return saveResult(data);
    if (action === 'getResults') return getResults();
    if (action === 'debug')      return debug(data);
    return { success: false, message: 'Unknown action: ' + action };
  } catch(err) {
    return { success: false, message: 'Server error: ' + err.message };
  }
}

// ─── PING ───────────────────────────────────────────────────────
function ping() {
  return {
    success:   true,
    message:   'Google Sheets connected ✓',
    timestamp: new Date().toISOString()
  };
}

// ─── LOGIN ──────────────────────────────────────────────────────
function login(data) {
  var email = String(data.email    || '').toLowerCase().trim();
  var pass  = String(data.password || '').trim();

  if (!email || !pass) return { success: false, message: 'Email and password required.' };

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) return { success: false, message: 'Users sheet not found. Create a tab named "Users".' };

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { success: false, message: 'No users found in the Users sheet.' };

  for (var i = 1; i < rows.length; i++) {
    var r          = rows[i];
    var rowEmail   = String(r[0] || '').toLowerCase().trim();
    var rowPass    = String(r[1] || '').trim();
    var rowActive  = String(r[6] !== undefined ? r[6] : 'TRUE').toUpperCase().trim();

    if (rowEmail === email && rowPass === pass) {
      if (rowActive === 'FALSE') {
        return { success: false, message: 'Account is inactive. Contact administrator.' };
      }
      return {
        success: true,
        user: {
          email:      email,
          name:       String(r[2] || email).trim(),
          role:       String(r[3] || 'employee').toLowerCase().trim() === 'admin' ? 'admin' : 'employee',
          department: String(r[4] || '').trim(),
          employeeId: String(r[5] || '').trim()
        }
      };
    }
  }

  return { success: false, message: 'Invalid email or password.' };
}

// ─── SAVE RESULT ────────────────────────────────────────────────
function saveResult(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_RESULTS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESULTS);
    var hdr = sheet.getRange(1, 1, 1, 15);
    hdr.setValues([[
      'Submitted At','Employee Name','Employee Email','Employee ID',
      'Department','Assessment Title','Score (%)','Earned Points',
      'Total Points','Result','Correct','Wrong','Skipped',
      'Assessment ID','Manager Email'
    ]]);
    hdr.setFontWeight('bold');
    hdr.setBackground('#1a6fff');
    hdr.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.submittedAt     || new Date().toLocaleString(),
    data.employeeName    || '',
    data.employeeEmail   || '',
    data.employeeId      || '',
    data.department      || '',
    data.assessmentTitle || '',
    data.score           || 0,
    data.earnedPoints    || 0,
    data.totalPoints     || 0,
    data.passed          || '',
    data.correct         || 0,
    data.wrong           || 0,
    data.skipped         || 0,
    data.assessmentId    || '',
    data.mgmtEmail       || ''
  ]);

  return { success: true, message: 'Result saved.' };
}

// ─── GET RESULTS ────────────────────────────────────────────────
function getResults() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_RESULTS);
  if (!sheet) return { success: true, results: [] };

  var rows    = sheet.getDataRange().getValues();
  var results = [];

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    results.push({
      submittedAt:     r[0]  ? r[0].toString()  : '',
      employeeName:    r[1]  || '',
      employeeEmail:   r[2]  || '',
      employeeId:      r[3]  || '',
      department:      r[4]  || '',
      assessmentTitle: r[5]  || '',
      score:           r[6]  || 0,
      earnedPoints:    r[7]  || 0,
      totalPoints:     r[8]  || 0,
      passed:          r[9]  || '',
      correct:         r[10] || 0,
      wrong:           r[11] || 0,
      skipped:         r[12] || 0,
      assessmentId:    r[13] || '',
      mgmtEmail:       r[14] || ''
    });
  }

  results.reverse(); // newest first
  return { success: true, results: results };
}

// ─── DEBUG ──────────────────────────────────────────────────────
// Helps diagnose login issues — shows what sheet contains
function debug(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) return { success: false, message: 'No Users sheet found!' };

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { success: false, message: 'Users sheet is empty (header only).' };

  var inEmail = String(data.email    || '').toLowerCase().trim();
  var inPass  = String(data.password || '').trim();
  var matchInfo = 'No matching email found in sheet.';

  var preview = [];
  for (var i = 1; i < Math.min(rows.length, 6); i++) {
    var r         = rows[i];
    var sheetEmail = String(r[0] || '').toLowerCase().trim();
    var sheetPass  = String(r[1] || '').trim();

    if (sheetEmail === inEmail) {
      var passMatch = sheetPass === inPass;
      matchInfo = 'Email found in row ' + (i+1) + '. '
        + 'Password match: ' + passMatch + '. '
        + 'Sheet pass length: ' + sheetPass.length + ', '
        + 'Input pass length: ' + inPass.length + '. '
        + (passMatch ? '✅ Credentials are correct!' : '❌ Passwords do not match. Check for spaces or formatting in column B.');
    }

    preview.push({
      row:       i + 1,
      email:     r[0],
      passLen:   sheetPass.length,
      passStart: sheetPass.substring(0, 2) + '***',
      name:      r[2],
      role:      r[3],
      dept:      r[4],
      active:    r[6]
    });
  }

  return {
    success:    true,
    sheetRows:  rows.length,
    headerRow:  rows[0],
    matchInfo:  matchInfo,
    preview:    preview
  };
}
