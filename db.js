/* ============================================================
   AurumLedger — db.js
   Firebase Firestore database layer.
   Replaces localStorage with cross-device cloud storage.

   HOW TO SET UP (one-time, ~5 minutes):
   1. Go to https://console.firebase.google.com
   2. Click "Create Project" → name it "AurumLedger" → Continue
   3. In the left menu: Build → Authentication → Get Started
      → Enable "Email/Password" provider → Save
   4. In the left menu: Build → Firestore Database → Create Database
      → Start in production mode → Choose a region → Done
   5. In Project Settings (gear icon) → General → Your Apps
      → Click </> (Web) → Register App → Copy the firebaseConfig object
   6. Paste your config values below, replacing the placeholders
   7. In Firestore → Rules → paste these rules and Publish:
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /users/{userId} {
            allow read, write: if request.auth != null && request.auth.uid == userId;
          }
        }
      }
   ============================================================ */

// ============================================================
// 🔑 PASTE YOUR FIREBASE CONFIG HERE
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCjaQEHhhHO-07ncXOzNDz8LGDqhG9VwEQ",
  authDomain:        "aurumledger-2fd29.firebaseapp.com",
  projectId:         "aurumledger-2fd29",
  storageBucket:     "aurumledger-2fd29.firebasestorage.app",
  messagingSenderId: "275128373139",
  appId:             "1:275128373139:web:ac5af13ea5aa262a752266"
};
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Signal to app.js init() that db.js is loaded and Firebase will handle auth
window._dbJsLoaded = true;

// ---- Init ----
const _app  = initializeApp(FIREBASE_CONFIG);
const _db   = getFirestore(_app);
const _auth = getAuth(_app);

// Enable offline persistence (data survives network loss)
enableIndexedDbPersistence(_db).catch(() => {});

// ---- Exports used by app.js ----
window.firebaseAuth = _auth;
window.firebaseDb   = _db;

// ---- Current user reference ----
let _userDocRef = null;
let _unsubSnapshot = null;

/**
 * Called by app.js after auth is confirmed.
 * Sets up the Firestore document reference and starts listening.
 */
export function initDb(uid) {
  _userDocRef = doc(_db, 'users', uid);

  // Real-time listener — updates state on any device change
  if (_unsubSnapshot) _unsubSnapshot();
  _unsubSnapshot = onSnapshot(_userDocRef, (snap) => {
    if (snap.exists()) {
      const remote = snap.data();
      // Only update if remote data differs from local (avoid loop)
      if (JSON.stringify(remote) !== JSON.stringify(window.state)) {
        window.state = _mergeDefaults(remote);
        renderAll();
        if (typeof renderAnalytics === 'function' && document.getElementById('page-analytics').classList.contains('active')) renderAnalytics();
        if (typeof renderAnnual   === 'function' && document.getElementById('page-annual').classList.contains('active'))   renderAnnual();
        if (typeof renderMonthly  === 'function' && document.getElementById('page-monthly').classList.contains('active'))  renderMonthly();
        updateSidebarYear();
        populateCategories();
        document.getElementById('settingCurrency').value = window.state.settings.currency;
        document.getElementById('settingYear').value     = window.state.settings.year;
        document.getElementById('settingName').value     = window.state.settings.name || '';
        renderCustomCats();
      }
    }
    // First load: hide loading overlay
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 600); }
  }, (err) => {
    console.error('Firestore snapshot error:', err);
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 600); }
  });
}

/**
 * Load state once on app start (fallback for first render).
 */
export async function loadStateFromDb() {
  if (!_userDocRef) return;
  try {
    const snap = await getDoc(_userDocRef);
    if (snap.exists()) {
      window.state = _mergeDefaults(snap.data());
    }
  } catch (e) {
    console.warn('loadStateFromDb error:', e);
  }
}

/**
 * Save state to Firestore. Called wherever saveState() was called before.
 */
async function saveStateToDb() {
  if (!_userDocRef) {
  console.error("Firestore not ready: user document reference missing");
  showToast('⚠', 'Database not ready. Please refresh and login again.');
  return;
}
  try {
    await setDoc(_userDocRef, window.state);
  } catch (e) {
    console.error('saveStateToDb error:', e);
    showToast('⚠', 'Sync error — check your connection.');
  }
}

/**
 * Sign out the current user.
 */
export async function logoutUser() {
  if (_unsubSnapshot) _unsubSnapshot();
  await signOut(_auth);
  window.location.href = 'login.html';
}

/**
 * Merge incoming Firestore data with default state shape
 * (in case new fields were added after the user's doc was created).
 */
function _mergeDefaults(remote) {
  const defaults = {
    transactions: [],
    bills: [],
    goals: [],
    settings: { currency: '₹', year: new Date().getFullYear(), name: '', categories: [] }
  };
  return {
    transactions: remote.transactions || defaults.transactions,
    bills:        remote.bills        || defaults.bills,
    goals:        remote.goals        || defaults.goals,
    settings: {
      ...defaults.settings,
      ...(remote.settings || {})
    }
  };
}

// ---- Auth state watcher — redirect if not logged in ----
onAuthStateChanged(_auth, async (user) => {
  if (!user) {
    // Not logged in → go to login page
    window.location.href = 'login.html';
    return;
  }
  // Show user email in sidebar

   const emailEl = document.getElementById('sidebarUserEmail');
if (emailEl) {
  emailEl.textContent = user.email;
  emailEl.style.display = 'block';
}

  // Init DB with user's UID
  await initDb(user.uid);
  await loadStateFromDb();

  // Now boot the app
  if (typeof appBoot === 'function') appBoot();
});

// ---- Expose logout globally ----
window.logoutUser = async function() {
  if (!confirm('Sign out of AurumLedger?')) return;
  if (_unsubSnapshot) _unsubSnapshot();
  await signOut(_auth);
  window.location.href = 'login.html';
};

// ---- Re-export auth helpers for login.html ----
window._authSignIn   = (email, pass) => signInWithEmailAndPassword(_auth, email, pass);
window._authSignUp   = (email, pass) => createUserWithEmailAndPassword(_auth, email, pass);
window._authReset    = (email)       => sendPasswordResetEmail(_auth, email);
window.saveStateToDb = saveStateToDb;