# GMM Billing Solutions — Assessment Portal
## Complete Deployment Guide

---

## 📁 File Structure

```
gmm-billing/
├── index.html                  ← Main app (upload to website root)
├── css/
│   └── style.css               ← All styles
├── js/
│   └── app.js                  ← All JavaScript logic
├── api/
│   ├── GoogleAppsScript.gs     ← Paste into Google Apps Script (database)
│   └── proxy.php               ← Optional PHP proxy (shared hosting fallback)
└── README.md                   ← This file
```

---

## 🚀 Step 1 — Set Up Google Sheets (Database)

### A. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **New spreadsheet**
2. Rename it: **GMM Billing — Assessment Data**
3. Create two tabs (sheets):
   - Rename **Sheet1** → `Users`
   - Click **+** → add tab → rename → `Results`

### B. Set up the Users tab

Add these headers in **Row 1** of the `Users` tab:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| email | password | name | role | department | employeeId | active |

Then add your users starting from Row 2:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| admin@gmmbilling.com | Admin@123 | Admin User | admin | Management | ADM-001 | TRUE |
| charges@gmmbilling.com | Charges@1 | Alex Johnson | employee | Charges Team | EMP-001 | TRUE |
| payment@gmmbilling.com | Payment@1 | Sarah Lee | employee | Payment Team | EMP-002 | TRUE |

> ⚠️ **Department** must exactly match the team names used in assessments.
> `role` must be `admin` or `employee` (lowercase).
> `active` = `TRUE` to allow login, `FALSE` to block.

---

## 🚀 Step 2 — Deploy the Google Apps Script

1. Open [script.google.com](https://script.google.com) → **New project**
2. Rename the project: `GMM Billing Backend`
3. Delete all existing code in the editor
4. Open `api/GoogleAppsScript.gs` from this package and **paste the entire contents**
5. Find this line and replace with your **Spreadsheet ID**:
   ```javascript
   var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
   ```
   > Your Spreadsheet ID is in the URL: `docs.google.com/spreadsheets/d/**ID_HERE**/edit`

6. Click **Deploy** → **New deployment**
   - Type: **Web app**
   - Description: `GMM Billing v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** → **Authorize** (grant permissions)
8. **Copy the Web App URL** — it looks like:
   `https://script.google.com/macros/s/AKfycby.../exec`

---

## 🚀 Step 3 — Upload to Your Website

Upload these files to your website (via cPanel File Manager, FTP, or your host's uploader):

```
public_html/           ← or your website root folder
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── api/
    └── proxy.php      ← upload even if not needed yet
```

> If you're uploading to a **subdirectory** (e.g. `yoursite.com/portal/`), upload everything into that folder.

---

## 🚀 Step 4 — Connect Google Sheets in the App

1. Open your website in a browser
2. Log in with: `admin@gmmbilling.com` / `Admin@123`
3. Click the **⚙ Settings** tab
4. Paste your **Google Apps Script Web App URL** into the URL field
5. Click **💾 Save URL**
6. Click **🔌 Test Connection** — you should see "✅ Connected!"

---

## ✅ Demo Accounts (Built-in Fallback)

These work even without Google Sheets connected:

| Email | Password | Role | Department |
|-------|----------|------|------------|
| admin@gmmbilling.com | Admin@123 | Admin | — |
| charges@gmmbilling.com | Charges@1 | Employee | Charges Team |
| payment@gmmbilling.com | Payment@1 | Employee | Payment Team |
| analyst@gmmbilling.com | Analyst@1 | Employee | Analyst Team |

---

## 🔧 Troubleshooting

### Login button does nothing / spins forever
- Open browser DevTools → Console tab — look for red errors
- Ensure `css/style.css` and `js/app.js` paths are correct
- Check that your GAS URL is saved in Settings

### "Invalid email or password" even with correct credentials
- Verify the email/password exist in the `Users` tab of your Google Sheet
- Check that `active` column is `TRUE`
- Test the GAS connection in Settings first

### CORS errors in console
- Redeploy your Apps Script (Deploy → Manage deployments → Edit → new version → Deploy)
- Make sure "Who has access" is set to **Anyone**

### Results not saving
- Open the Settings tab and test connection
- If test fails, your Google Sheet ID may be wrong
- If test passes but saves fail, check the `Results` tab exists (the script creates it automatically on first save)

### Using PHP Proxy (shared hosting)
If direct `fetch()` to script.google.com fails:
1. Edit `api/proxy.php` — set `APPS_SCRIPT_URL` to your GAS URL
2. In `js/app.js`, replace the `gasCall()` function body with:
   ```javascript
   async function gasCall(data) {
     const resp = await fetch('/api/proxy.php', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(data)
     });
     if (!resp.ok) throw new Error('HTTP ' + resp.status);
     return resp.json();
   }
   ```

---

## 📐 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend UI | HTML5 + CSS3 + Vanilla JavaScript |
| Styling | Custom CSS (dark theme, Google Fonts) |
| Database | Google Sheets |
| Backend API | Google Apps Script (serverless) |
| Optional Proxy | PHP 7.4+ |
| Hosting | Any static web host (cPanel, Hostinger, SiteGround, etc.) |

---

## 📞 How Assessment Flow Works

```
Employee logs in
    ↓
App checks GAS → Google Sheets Users tab
    ↓
Employee sees their team's published assessment
    ↓
Employee answers questions (locked after selection)
    ↓
Employee submits → score calculated
    ↓
Result sent to GAS → saved in Google Sheets Results tab
    ↓
Completion screen shown (no score displayed to employee)
    ↓
Admin views results in the 📊 All Results tab
```
