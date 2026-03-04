/**
 * ══════════════════════════════════════════════════════════════
 *  GMM Billing Solutions — Assessment Portal
 *  GoogleAppsScript.gs  |  Paste this ENTIRE file into a new
 *  Google Apps Script project and deploy as a Web App.
 *
 *  SETUP STEPS:
 *  1. Open https://script.google.com  → New project
 *  2. Paste this entire file, replacing any existing code
 *  3. Edit SPREADSHEET_ID below (copy it from your Google Sheet URL)
 *  4. Click Deploy → New deployment → Web app
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  5. Copy the Web App URL and paste it into the Settings tab
 *     in the GMM Billing portal.
 *
 *  GOOGLE SHEET TABS REQUIRED:
 *  ┌──────────┬───────────────────────────────────────────────┐
 *  │ Tab name │ Columns (row 1 = headers)                     │
 *  ├──────────┼───────────────────────────────────────────────┤
 *  │ Users    │ email | password | name | role | department    │
 *  │          │ employeeId | active                            │
 *  ├──────────┼───────────────────────────────────────────────┤
 *  │ Results  │ (auto-created by script)                      │
 *  └──────────┴───────────────────────────────────────────────┘
 * ══════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────────────
// Replace with YOUR Google Sheet ID (from the URL bar)
// e.g. https://docs.google.com/spreadsheets/d/1ABC123.../edit
//                                               ↑ this part
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

var SHEET_USERS   = 'Users';
var SHEET_RESULTS = 'Results';

// ── CORS HEADERS ──────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────
function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var action = data.action || '';

    if (action === 'ping')        return jsonResponse(handlePing());
    if (action === 'login')       return jsonResponse(handleLogin(data));
    if (action === 'saveResult')  return jsonResponse(handleSaveResult(data));
    if (action === 'getResults')  return jsonResponse(handleGetResults());

    return jsonResponse({ success: false, message: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, message: 'Server error: ' + err.message });
  }
}

// Also handle GET (for browser test / JSONP fallback)
function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || '';
  var callback = params.callback || '';

  var result;
  if (action === 'ping') result = handlePing();
  else result = { success: false, message: 'GET only supports ping' };

  var output = JSON.stringify(result);
  if (callback) {
    output = callback + '(' + output + ');';
    return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
}

// ── PING ──────────────────────────────────────────────────────
function handlePing() {
  return { success: true, message: 'Google Sheets connection is working ✓', timestamp: new Date().toISOString() };
}

// ── LOGIN ─────────────────────────────────────────────────────
function handleLogin(data) {
  var email    = (data.email    || '').toLowerCase().trim();
  var password = (data.password || '').trim();

  if (!email || !password) {
    return { success: false, message: 'Email and password are required.' };
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_USERS);

  if (!sheet) {
    return { success: false, message: 'Users sheet not found. Please create a "Users" tab.' };
  }

  var rows = sheet.getDataRange().getValues();
  // Row 0 = headers: email, password, name, role, department, employeeId, active
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rowEmail    = (row[0] || '').toString().toLowerCase().trim();
    var rowPassword = (row[1] || '').toString().trim();
    var rowName     = (row[2] || '').toString().trim();
    var rowRole     = (row[3] || '').toString().toLowerCase().trim();
    var rowDept     = (row[4] || '').toString().trim();
    var rowEmpId    = (row[5] || '').toString().trim();
    var rowActive   = (row[6] !== undefined) ? row[6].toString().toUpperCase() : 'TRUE';

    if (rowEmail === email && rowPassword === password) {
      if (rowActive === 'FALSE') {
        return { success: false, message: 'Your account is inactive. Contact your administrator.' };
      }
      return {
        success: true,
        user: {
          email: rowEmail,
          name: rowName || rowEmail,
          role: rowRole === 'admin' ? 'admin' : 'employee',
          department: rowDept,
          employeeId: rowEmpId
        }
      };
    }
  }

  return { success: false, message: 'Invalid email or password.' };
}

// ── SAVE RESULT ───────────────────────────────────────────────
function handleSaveResult(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_RESULTS);

  // Auto-create Results sheet with headers if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESULTS);
    sheet.appendRow([
      'Submitted At', 'Employee Name', 'Employee Email', 'Employee ID',
      'Department', 'Assessment Title', 'Score (%)', 'Earned Points',
      'Total Points', 'Result', 'Correct', 'Wrong', 'Skipped',
      'Assessment ID', 'Manager Email'
    ]);
    // Style headers
    var headerRange = sheet.getRange(1, 1, 1, 15);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a6fff');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.submittedAt   || new Date().toLocaleString(),
    data.employeeName  || '',
    data.employeeEmail || '',
    data.employeeId    || '',
    data.department    || '',
    data.assessmentTitle || '',
    data.score         || 0,
    data.earnedPoints  || 0,
    data.totalPoints   || 0,
    data.passed        || '',
    data.correct       || 0,
    data.wrong         || 0,
    data.skipped       || 0,
    data.assessmentId  || '',
    data.mgmtEmail     || ''
  ]);

  return { success: true, message: 'Result saved.' };
}

// ── GET RESULTS ───────────────────────────────────────────────
function handleGetResults() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_RESULTS);

  if (!sheet) {
    return { success: true, results: [] };
  }

  var rows    = sheet.getDataRange().getValues();
  var headers = rows[0]; // first row
  var results = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if(!row[0]) continue; // skip blank rows
    results.push({
      submittedAt:    row[0] ? row[0].toString() : '',
      employeeName:   row[1] || '',
      employeeEmail:  row[2] || '',
      employeeId:     row[3] || '',
      department:     row[4] || '',
      assessmentTitle:row[5] || '',
      score:          row[6] || 0,
      earnedPoints:   row[7] || 0,
      totalPoints:    row[8] || 0,
      passed:         row[9] || '',
      correct:        row[10] || 0,
      wrong:          row[11] || 0,
      skipped:        row[12] || 0,
      assessmentId:   row[13] || '',
      mgmtEmail:      row[14] || ''
    });
  }

  // Return newest first
  results.reverse();
  return { success: true, results: results };
}
