# GMM Billing Solutions — Assessment Portal

A complete web-based assessment portal for healthcare billing teams.  
Hosted free on GitHub Pages. Database: Google Sheets via Apps Script.

---

## 📁 File Structure

```
gmm-billing/
├── index.html              ← Main application
├── css/
│   └── style.css           ← All styles
├── js/
│   └── app.js              ← All application logic
└── api/
    └── GoogleAppsScript.gs ← Backend (deploy to Google Apps Script)
```

---

## 🚀 Quick Start (GitHub Pages)

### Step 1 — Upload to GitHub

1. Create a new GitHub repository (public)
2. Upload all files keeping the folder structure above
3. Go to **Settings → Pages → Source: main branch / root**
4. Your URL: `https://YOUR-USERNAME.github.io/REPO-NAME/`

### Step 2 — Demo Login (works immediately, no setup needed)

| Email | Password | Role |
|-------|----------|------|
| admin@gmmbilling.com | Admin@123 | Admin |
| charges@gmmbilling.com | Charges@1 | Employee |
| payment@gmmbilling.com | Payment@1 | Employee |
| analyst@gmmbilling.com | Analyst@1 | Employee |

The login page has quick-fill buttons for all demo accounts.

---

## 🔗 Connect Google Sheets (for real users)

### Step 1 — Create Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → New Spreadsheet
2. Create two tabs: **Users** and **Results** (exact names, capital first letter)
3. In the **Users** tab, add this header row:

   | A | B | C | D | E | F | G |
   |---|---|---|---|---|---|---|
   | email | password | name | role | department | employeeId | active |

4. Add your employees below the header:

   | john@company.com | Pass@123 | John Doe | employee | Charges Team | EMP-001 | TRUE |

5. Copy your Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**COPY_THIS_PART**/edit`

### Step 2 — Deploy Google Apps Script

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Delete all existing code, paste the entire contents of `api/GoogleAppsScript.gs`
3. Find line 22 and replace `YOUR_SPREADSHEET_ID_HERE` with your Sheet ID
4. Press **Ctrl+S** to save
5. Click **Deploy → New Deployment**
   - Click the gear icon → select **Web App**
   - Description: `GMM Portal v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** → click **Authorize access** → sign in → **Allow**
7. **Copy the Web App URL** (looks like `https://script.google.com/macros/s/ABC.../exec`)

### Step 3 — Connect Portal to Sheet

1. Open your portal → Login as admin
2. Go to **⚙ Settings** tab
3. Paste the Apps Script URL
4. Click **💾 Save URL**
5. Click **🔌 Test Connection** — should show ✅ Connected!

---

## ❗ Troubleshooting Login

If real users can't login after connecting Google Sheets:

1. Log in as admin → Settings → click **🔍 Debug** button
2. Enter the failing email/password when prompted
3. The debug output will tell you exactly what's wrong

**Common issues:**

| Problem | Fix |
|---------|-----|
| "Users sheet not found" | Tab must be named exactly `Users` (capital U) |
| "Password match: false" | Select all cells in Sheet → Format → Number → **Plain text** — Google Sheets sometimes adds invisible spaces |
| "No users found" | You only have the header row — add data rows below it |
| Test connection fails | Re-deploy as a **New Deployment** — editing code doesn't update existing deployments |
| Still failing after redeploy | Make sure Who has access is set to **Anyone** (not "Anyone with Google account") |

---

## ✨ Features

- ✅ Admin dashboard with assessment management
- ✅ Question types: MCQ, Multi-Select, True/False, Yes/No, Short Answer
- ✅ Team-based assessment assignment
- ✅ One-attempt-only enforcement
- ✅ Anti-cheat: tab switch detection with warnings
- ✅ Session persistence (page refresh keeps you logged in)
- ✅ Results dashboard with Excel export
- ✅ Google Sheets as database (no server needed)
- ✅ Works on GitHub Pages (free hosting)
- ✅ Demo accounts for testing without Google Sheets

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Hosting | GitHub Pages (free) |
| Database | Google Sheets |
| Backend API | Google Apps Script (free) |
| Auth | Google Sheets lookup + demo accounts |
| Export | CSV (opens in Excel) |
