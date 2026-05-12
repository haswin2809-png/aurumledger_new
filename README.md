# ⚜ AurumLedger — Setup Guide

## File Structure

```
AurumLedger/
├── index.html      ← Main dashboard (open this in browser)
├── login.html      ← Login / Sign up / Forgot password page
├── style.css       ← All styles (dashboard + login page)
├── app.js          ← All dashboard logic
├── export.js       ← CSV / PDF / JSON export functions
├── db.js           ← Firebase Auth + Firestore cloud database
└── README.md       ← This file
```

---

## Phase 1 — Run Locally (No Firebase, No Login)

Use this to test the full UI immediately, with data saved to your browser's localStorage.

1. Place all 7 files in the same folder.
2. Open `index.html` in any browser (Chrome, Edge, Firefox, Safari).
3. All features work: transactions, bills, goals, analytics, reports, export.
4. Data is saved locally in your browser — not synced across devices.

> The "Sign Out" button in the sidebar footer will redirect to `login.html`,  
> which shows the login form but won't authenticate (Firebase not connected yet).

---

## Phase 2 — Enable Login + Cloud Database (Firebase)

This enables:
- ✅ Secure login from any device
- ✅ Sign up with email + password
- ✅ Forgot password (email reset link)
- ✅ All data synced across devices in real-time
- ✅ Offline support (changes sync when connection returns)

### Step 1 — Create Firebase Project (5 minutes)

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"** → name it `AurumLedger` → Continue → Create project

### Step 2 — Enable Email/Password Authentication

1. In the Firebase console left sidebar: **Build → Authentication → Get Started**
2. Click the **"Email/Password"** provider
3. Toggle **Enable** → **Save**

### Step 3 — Create Firestore Database

1. In the left sidebar: **Build → Firestore Database → Create database**
2. Choose **"Start in production mode"** → Next
3. Select a region closest to you → **Done**
4. Wait ~30 seconds for the database to provision

### Step 4 — Set Firestore Security Rules

1. In Firestore, click the **"Rules"** tab
2. Replace the existing rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click **Publish**

> This ensures each user can only access their own data.

### Step 5 — Get Your Firebase Config

1. Click the **gear icon** (⚙) at the top of the left sidebar → **Project settings**
2. Scroll down to **"Your apps"** section
3. Click the **`</>`** (Web) icon → Register app → name it `AurumLedger` → Register
4. You'll see a config object like this — copy the whole thing:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "aurumledger.firebaseapp.com",
  projectId: "aurumledger",
  storageBucket: "aurumledger.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Step 6 — Paste Config into Your Files

**In `db.js`** — find `FIREBASE_CONFIG` near the top and replace the placeholder values:

```javascript
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",         // ← paste your values
  authDomain:        "yourapp.firebaseapp.com",
  projectId:         "yourapp",
  storageBucket:     "yourapp.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc"
};
```

**In `login.html`** — find the same `FIREBASE_CONFIG` block and paste the same values.

### Step 7 — Activate Firebase in index.html

Open `index.html` and find this comment block near the bottom:

```html
<!-- Uncomment when Firebase is configured: -->
<!-- <script type="module" src="db.js"></script> -->
```

Remove the comment markers so it reads:

```html
<!-- Firebase is configured: -->
<script type="module" src="db.js"></script>
```

### Step 8 — Test

1. Open `login.html` in your browser
2. Click **"Create Account"** → enter your email and password → submit
3. You'll be redirected to the dashboard automatically
4. Add a transaction → open the dashboard on another device → it appears instantly

---

## Feature Reference

### Feature 1 — Export

| Location | Formats Available |
|---|---|
| Transactions page (filter bar, top right) | CSV, PDF (print), JSON |
| Monthly Records (each month header) | CSV, JSON |
| Annual Report page (chart header) | CSV, JSON |
| Settings → Data Management | Full JSON backup |

**CSV** includes all columns: Date, Description, Type, Category, Method, Amount, Notes + totals row.  
**PDF** opens your browser's print dialog — choose "Save as PDF" to save.  
**JSON** is a structured export with summary totals included.

### Feature 2 — Flexible Bill Due Dates

The old "Due Day of Month" (a number 1–31) has been replaced with:
- **Next Due Date** — exact date picker (any day, month, year)
- **Recurrence** — dropdown: One-time / Weekly / Monthly / Every 2 Months / Quarterly / Half-Yearly / Annually

This supports all bill types: monthly rent, annual insurance, 6-month subscriptions, one-time payments.

### Feature 3 — Smart Bill Status + Payment Button

- **Status is automatic** — calculated from the due date vs today
  - 🔴 **Overdue** — past due date
  - 🟡 **Due Soon** — within 3 days
  - 🟢 **Upcoming** — more than 3 days away
  - ⚪ **Paid** — you've marked it paid
- **Mark as Paid button** — appears on every bill in the bill list
- **Undo Payment** — reverse the paid status if marked by mistake
- **Auto-reset** — recurring bills automatically reset to "Upcoming" at the start of their next cycle

### Feature 4 — Login + Forgot Password

- Sign in with email + password
- Create account (self-service registration)
- Forgot Password — sends a reset link to your email (handled by Firebase)
- Session persists across browser restarts and devices
- The dashboard redirects to login.html if not authenticated

### Feature 5 — Cloud Database

- All data (transactions, bills, goals, settings) stored in Firebase Firestore
- Syncs in real-time across all your devices
- Built-in offline mode — changes are queued and synced when back online
- Data is private to your account — no one else can access it (Firestore rules enforced)

---

## Hosting (Optional — Access from Any Browser)

To make AurumLedger accessible via a URL (not just a local file):

### Option A — Firebase Hosting (free, easiest)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # select your project, set public dir to "."
firebase deploy
```
Your app is live at `https://YOUR-PROJECT.web.app`

### Option B — Any Static Host
Upload all 7 files to any static host: Netlify, Vercel, GitHub Pages, or your own server.  
No backend required — it's entirely client-side.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Login page shows error "auth/configuration-not-found" | Firebase config not pasted correctly in login.html |
| Data doesn't sync across devices | Check that db.js script tag is uncommented in index.html |
| "Permission denied" in browser console | Firestore security rules not published correctly (Step 4) |
| Export buttons don't work | Make sure export.js is in the same folder as index.html |
| Charts don't appear | Chart.js CDN blocked — check internet connection |

---

*AurumLedger — Private Wealth Dashboard · All data stays private and secure.*