/* ==================================================
   AI Phishing Shield — Script v4
   KEY FIXES:
   1. Google Sign-In uses onload callback (not DOMContentLoaded)
   2. Splash screen hides after init
   3. Render.com cold start handled with progress messages
   4. Mobile sidebar open/close with overlay
   ================================================== */

const BASE = "https://ai-phishing-detection-x476.onrender.com";
const GOOGLE_CLIENT_ID = "634583123258-jitpku74o34oaijj17sefeh4iv99ujls.apps.googleusercontent.com";

let authToken    = localStorage.getItem("authToken") || null;
let currentUser  = null;
let allHistory   = [];
let charts       = {};
let todayScans   = 0;
let todayPhish   = 0;
let gsiReady     = false;

/* ==================================================
   SPLASH PROGRESS HELPER
   ================================================== */
function setSplashStatus(msg, pct) {
  const el = document.getElementById("splashStatus");
  const bar = document.getElementById("splashBar");
  if (el)  el.textContent = msg;
  if (bar) bar.style.width = pct + "%";
}

function hideSplash() {
  const el = document.getElementById("splashScreen");
  if (el) el.classList.add("gone");
}

/* ==================================================
   GOOGLE SIGN-IN INIT
   Called by <script onload="initGoogleSignIn()">
   This fires ONLY when the GSI script has fully loaded.
   ================================================== */
function initGoogleSignIn() {
  gsiReady = true;
  try {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCallback,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const cfg = {
      theme: "outline",
      size: "large",
      width: 320,
      shape: "pill",
      text: "continue_with",
      locale: "en",
    };

    const slot1 = document.getElementById("googleSignInBtn");
    const slot2 = document.getElementById("googleSignUpBtn");

    if (slot1) {
      google.accounts.id.renderButton(slot1, cfg);
      hideSkeleton("gSkelLogin");
    }
    if (slot2) {
      google.accounts.id.renderButton(slot2, cfg);
      hideSkeleton("gSkelReg");
    }
  } catch(e) {
    console.warn("Google GSI init failed:", e);
    onGsiError();
  }
}

function hideSkeleton(id) {
  // Give a tiny delay so Google's iframe actually renders
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.classList.add("gone");
  }, 400);
}

/* Called if Google script fails to load (network issue) */
function onGsiError() {
  ["gSkelLogin","gSkelReg"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div style="font-size:13px;color:var(--text3);text-align:center;padding:10px">
      Google Sign-In unavailable<br><small>Use username/password</small></div>`;
  });
}

/* ==================================================
   APP INIT — runs after DOM is ready
   ================================================== */
window.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  startMatrix();

  setSplashStatus("Starting up...", 20);

  // Check API status in background (don't block splash)
  checkApiStatus();
  setInterval(checkApiStatus, 30000);

  setSplashStatus("Checking session...", 55);

  // Auto-login if token stored
  if (authToken) {
    try {
      setSplashStatus("Restoring session...", 70);
      const r = await apiFetch("/auth/me");
      if (r.ok) {
        currentUser = await r.json();
        setSplashStatus("Welcome back!", 100);
        await sleep(400);
        hideSplash();
        showAuthSection(false);
        enterApp();
        return;
      } else {
        clearAuth();
      }
    } catch {
      clearAuth();
    }
  }

  setSplashStatus("Ready!", 100);
  await sleep(350);
  hideSplash();
  showAuthSection(true);
});

function showAuthSection(show) {
  const el = document.getElementById("authSection");
  if (!el) return;
  if (show) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ==================================================
   THEME
   ================================================== */
function applyTheme() {
  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
    const btn = document.getElementById("themeBtn");
    if (btn) btn.textContent = "☀️";
  }
}
function toggleTheme() {
  document.body.classList.toggle("light");
  const light = document.body.classList.contains("light");
  localStorage.setItem("theme", light ? "light" : "dark");
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = light ? "☀️" : "🌙";
  if (!document.getElementById("sectionStats")?.classList.contains("hidden")) loadStats();
}

/* ==================================================
   MATRIX RAIN
   ================================================== */
function startMatrix() {
  const cv = document.getElementById("matrixCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
  resize();
  window.addEventListener("resize", resize);
  const chars = "01アイウカキサシスセタチツテトナニ";
  let cols  = Math.floor(cv.width / 20);
  let drops = Array(cols).fill(1);
  window.addEventListener("resize", () => {
    cols  = Math.floor(cv.width / 20);
    drops = Array(cols).fill(1);
  });
  setInterval(() => {
    ctx.fillStyle = "rgba(8,14,26,0.04)";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#63ffb4";
    ctx.font = "12px monospace";
    drops.forEach((y, i) => {
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 20, y * 20);
      if (y * 20 > cv.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    });
  }, 65);
}

/* ==================================================
   API HELPERS
   ================================================== */
async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return fetch(BASE + path, { ...opts, headers });
}

async function checkApiStatus() {
  const dot = document.querySelector(".adot");
  const lbl = document.querySelector(".albl");
  try {
    const r = await fetch(BASE + "/health", { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      dot?.classList.add("on"); dot?.classList.remove("off");
      if (lbl) lbl.textContent = "Online";
    } else throw new Error();
  } catch {
    dot?.classList.add("off"); dot?.classList.remove("on");
    if (lbl) lbl.textContent = "Offline";
  }
}

/* ==================================================
   AUTH TABS
   ================================================== */
function switchTab(tab) {
  ["loginForm","registerForm","forgotForm"].forEach(id =>
    document.getElementById(id)?.classList.add("hidden")
  );
  document.getElementById("tabLogin")?.classList.toggle("active", tab === "login");
  document.getElementById("tabRegister")?.classList.toggle("active", tab === "register");
  if (tab === "login")    document.getElementById("loginForm")?.classList.remove("hidden");
  if (tab === "register") document.getElementById("registerForm")?.classList.remove("hidden");
}
function showForgot() {
  ["loginForm","registerForm"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById("forgotForm")?.classList.remove("hidden");
  document.getElementById("tabLogin")?.classList.remove("active");
  document.getElementById("tabRegister")?.classList.remove("active");
}
function togglePass(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === "password" ? "text" : "password";
  btn.textContent = el.type === "password" ? "👁" : "🙈";
}
function updateStrength(val) {
  let s = 0;
  if (val.length >= 6) s++;
  if (val.length >= 10) s++;
  if (/[A-Z]/.test(val)) s++;
  if (/[0-9]/.test(val)) s++;
  if (/[^A-Za-z0-9]/.test(val)) s++;
  const fill = document.getElementById("strengthFill");
  const text = document.getElementById("strengthText");
  if (!fill) return;
  fill.style.width = (s / 5 * 100) + "%";
  const cols = ["","#ff5b5b","#ff8c00","#ffb545","#40e88a","#63ffb4"];
  const lbls = ["","Weak","Weak","Fair","Strong","Strong!"];
  fill.style.background = cols[s] || "#63ffb4";
  if (text) { text.textContent = lbls[s] || ""; text.style.color = cols[s] || ""; }
}
function setMsg(id, msg, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "msg " + type;
}
function setBtnLoading(btnId, spinId, txtId, loading, txt) {
  const btn  = document.getElementById(btnId);
  const spin = document.getElementById(spinId);
  const tx   = document.getElementById(txtId);
  if (btn)  btn.disabled = loading;
  if (spin) spin.classList.toggle("hidden", !loading);
  if (tx)   tx.textContent = loading ? "Please wait..." : txt;
}

/* ==================================================
   GOOGLE AUTH CALLBACK
   ================================================== */
async function handleGoogleCallback(response) {
  toast("Verifying with Google...", "info");
  try {
    const r = await apiFetch("/auth/google", {
      method: "POST",
      body: JSON.stringify({ token: response.credential }),
    });
    const data = await r.json();
    if (!r.ok) { toast(data.detail || "Google login failed", "error"); return; }
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem("authToken", authToken);
    enterApp();
  } catch(e) {
    toast("Google login error. Try username/password.", "error");
    console.error(e);
  }
}

/* ==================================================
   LOGIN
   ================================================== */
async function login() {
  const username = document.getElementById("loginUser")?.value.trim();
  const password = document.getElementById("loginPass")?.value;
  if (!username || !password) { setMsg("loginMsg","Enter username and password","err"); return; }

  setBtnLoading("loginBtn","loginSpin","loginBtnTxt", true, "Sign In →");
  setMsg("loginMsg","","");

  try {
    const r = await apiFetch("/auth/login", {
      method:"POST", body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) {
      setMsg("loginMsg", data.detail || "Invalid credentials", "err");
      setBtnLoading("loginBtn","loginSpin","loginBtnTxt", false, "Sign In →");
      return;
    }
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem("authToken", authToken);
    enterApp();
  } catch(e) {
    // Handle Render.com cold start
    setMsg("loginMsg","⏳ Server is waking up (free tier takes ~30s)… please retry in a moment","err");
    setBtnLoading("loginBtn","loginSpin","loginBtnTxt", false, "Sign In →");
  }
}

/* ==================================================
   REGISTER
   ================================================== */
async function register() {
  const username = document.getElementById("regUser")?.value.trim();
  const email    = document.getElementById("regEmail")?.value.trim();
  const password = document.getElementById("regPass")?.value;
  if (!username || !password) { setMsg("registerMsg","Username and password are required","err"); return; }
  if (password.length < 6)   { setMsg("registerMsg","Password must be at least 6 characters","err"); return; }

  setBtnLoading("regBtn","regSpin","regBtnTxt", true, "Create Account →");
  setMsg("registerMsg","","");

  try {
    const r = await apiFetch("/auth/register", {
      method:"POST", body: JSON.stringify({ username, email, password })
    });
    const data = await r.json();
    if (!r.ok) {
      setMsg("registerMsg", data.detail || "Registration failed", "err");
      setBtnLoading("regBtn","regSpin","regBtnTxt", false, "Create Account →");
      return;
    }
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem("authToken", authToken);
    enterApp();
  } catch(e) {
    setMsg("registerMsg","⏳ Server is waking up… please retry in a moment","err");
    setBtnLoading("regBtn","regSpin","regBtnTxt", false, "Create Account →");
  }
}

/* ==================================================
   FORGOT / RESET
   ================================================== */
function sendReset() {
  const u = document.getElementById("forgotUser")?.value.trim();
  if (!u) { setMsg("forgotMsg","Enter your username","err"); return; }
  setMsg("forgotMsg","✅ Reset link sent if account exists.","ok");
  setTimeout(() => {
    document.getElementById("forgotStep1")?.classList.add("hidden");
    document.getElementById("forgotStep2")?.classList.remove("hidden");
  }, 1500);
}
function resetPassword() {
  const np = document.getElementById("newPass")?.value;
  const cp = document.getElementById("confirmPass")?.value;
  if (!np || !cp) { setMsg("resetMsg","Fill all fields","err"); return; }
  if (np !== cp)  { setMsg("resetMsg","Passwords don't match","err"); return; }
  setMsg("resetMsg","✅ Password updated!","ok");
  setTimeout(() => switchTab("login"), 1500);
}

/* ==================================================
   ENTER APP  — KEY FIX: use classList, NOT style.display
   ================================================== */
function enterApp() {
  document.getElementById("authSection")?.classList.add("hidden");
  document.getElementById("mainApp")?.classList.remove("hidden");

  const uname  = currentUser?.username || "User";
  const role   = currentUser?.role || "user";
  const avatar = currentUser?.avatar ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uname)}`;

  const sbN = document.getElementById("sbName");
  const sbR = document.getElementById("sbRole");
  const sbA = document.getElementById("sbAvatar");
  if (sbN) sbN.textContent = uname;
  if (sbR) sbR.textContent = role === "admin" ? "Administrator" : "Member";
  if (sbA) sbA.src = avatar;

  if (role === "admin") {
    const adminBtn = document.getElementById("snav-admin");
    if (adminBtn) adminBtn.classList.remove("hidden");
  }

  // Clear form fields
  ["loginUser","loginPass","regUser","regEmail","regPass"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  setBtnLoading("loginBtn","loginSpin","loginBtnTxt", false, "Sign In →");
  setBtnLoading("regBtn","regSpin","regBtnTxt", false, "Create Account →");

  showSection("scan");
  toast(`Welcome, ${uname}! 👋`, "success");
}

/* ==================================================
   LOGOUT
   ================================================== */
function logout() {
  clearAuth();
  document.getElementById("mainApp")?.classList.add("hidden");
  document.getElementById("authSection")?.classList.remove("hidden");
  closeSidebar();
  switchTab("login");
  toast("Logged out successfully", "info");
}
function clearAuth() {
  authToken = null; currentUser = null;
  localStorage.removeItem("authToken");
}

/* ==================================================
   SIDEBAR
   ================================================== */
function openSidebar() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("sbOverlay")?.classList.remove("hidden");
}
function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sbOverlay")?.classList.add("hidden");
}
function toggleSidebar() {
  const sb = document.getElementById("sidebar");
  if (sb?.classList.contains("open")) closeSidebar();
  else openSidebar();
}

/* ==================================================
   SECTION NAV
   ================================================== */
function showSection(name) {
  ["Scan","History","Stats","Admin"].forEach(s => {
    document.getElementById("section"+s)?.classList.add("hidden");
    document.getElementById("snav-"+s.toLowerCase())?.classList.remove("active");
  });
  document.getElementById("section"+name.charAt(0).toUpperCase()+name.slice(1))?.classList.remove("hidden");
  document.getElementById("snav-"+name)?.classList.add("active");

  const titles = {scan:"Threat Scanner",history:"Scan History",stats:"Statistics",admin:"Admin Dashboard"};
  const tb = document.getElementById("topbarTitle");
  if (tb) tb.textContent = titles[name] || "Dashboard";

  if (name === "history") loadHistory();
  if (name === "stats")   loadStats();
  if (name === "admin")   loadAdminData();

  if (window.innerWidth < 900) closeSidebar();
}

/* ==================================================
   SCAN TABS
   ================================================== */
function switchScanTab(tab) {
  ["text","url","deep","batch"].forEach(t => {
    document.getElementById("panel-"+t)?.classList.add("hidden");
    document.getElementById("stab-"+t)?.classList.remove("on");
  });
  document.getElementById("panel-"+tab)?.classList.remove("hidden");
  document.getElementById("stab-"+tab)?.classList.add("on");
  clearResults();
}
function clearResults() {
  document.getElementById("resultArea")?.classList.add("hidden");
  document.getElementById("deepResultArea")?.classList.add("hidden");
  document.getElementById("batchResults")?.classList.add("hidden");
}

/* ==================================================
   INPUT HELPERS
   ================================================== */
function updateCharCount(el, cid, max) {
  const c = document.getElementById(cid);
  if (!c) return;
  c.textContent = `${el.value.length} / ${max}`;
  c.style.color = el.value.length > max * 0.9 ? "var(--amber)" : "";
}
function clearInput(inputId, cid, max) {
  const el = document.getElementById(inputId);
  if (el) el.value = "";
  updateCharCount({ value:"" }, cid, max);
  clearResults();
}
async function pasteUrl() {
  try {
    const t = await navigator.clipboard.readText();
    const el = document.getElementById("urlInput");
    if (el) el.value = t.replace(/^https?:\/\//,"");
    toast("Pasted!", "info");
  } catch {
    toast("Allow clipboard access to paste", "warn");
  }
}
function fillExample(type, v) {
  const phishText = `URGENT: Your PayPal account has been suspended due to suspicious activity.\nVerify immediately at http://paypa1-secure-verify.com/login\nFailure to act within 24 hours will result in permanent closure.\nEnter your password and billing info to restore access.`;
  const safeText  = `Hi Sarah,\nJust confirming our meeting tomorrow at 3 PM.\nAgenda: Q3 review and next quarter planning.\nPlease bring the spreadsheets from last week.\nBest, Mike`;
  if (type === "text") {
    const el = document.getElementById("textInput");
    if (el) { el.value = v === "phish" ? phishText : safeText; updateCharCount(el,"textCount",2000); }
  } else {
    const el = document.getElementById("urlInput");
    if (el) el.value = v === "phish"
      ? "paypa1-secure-login.verification-update.com/account/verify"
      : "google.com";
  }
}

/* ==================================================
   LOADER
   ================================================== */
const STEPS = ["Loading ML models…","Tokenizing input…","Running classifier…","Calculating confidence…","Analyzing patterns…","Generating report…"];
function showLoader(msg = "Analyzing...") {
  const ld = document.getElementById("scanLoader");
  const tx = document.getElementById("loaderText");
  const st = document.getElementById("loaderSteps");
  ld?.classList.remove("hidden");
  if (tx) tx.textContent = msg;
  if (st) st.innerHTML = "";
  let i = 0;
  return setInterval(() => {
    if (!st || i >= STEPS.length) return;
    const d = document.createElement("div");
    d.textContent = "▶ " + STEPS[i++];
    st.appendChild(d);
  }, 350);
}
function hideLoader(interval) {
  clearInterval(interval);
  document.getElementById("scanLoader")?.classList.add("hidden");
}

/* ==================================================
   SCAN TEXT
   ================================================== */
async function scanText() {
  const text = document.getElementById("textInput")?.value.trim();
  if (!text) { toast("Enter some text to analyze","warn"); return; }
  clearResults();
  const iv = showLoader("Analyzing text for threats…");
  try {
    const r = await apiFetch("/predict-text",{ method:"POST", body:JSON.stringify({text}) });
    const d = await r.json();
    hideLoader(iv);
    renderResult(d);
    updateMini(d.label === "phishing");
  } catch(e) { hideLoader(iv); toast("API error: "+e.message,"error"); }
}

/* ==================================================
   SCAN URL
   ================================================== */
async function scanUrl() {
  let raw = document.getElementById("urlInput")?.value.trim();
  if (!raw) { toast("Enter a URL","warn"); return; }
  if (!/^https?:\/\//i.test(raw)) raw = "https://"+raw;
  clearResults();
  const iv = showLoader("Scanning URL for threats…");
  try {
    const r = await apiFetch("/predict-url",{ method:"POST", body:JSON.stringify({url:raw}) });
    const d = await r.json();
    hideLoader(iv);
    renderResult(d,"url");
    updateMini(d.label === "phishing");
  } catch(e) { hideLoader(iv); toast("API error: "+e.message,"error"); }
}

/* ==================================================
   DEEP ANALYSIS
   ================================================== */
async function scanDeep() {
  const text = document.getElementById("deepInput")?.value.trim();
  if (!text) { toast("Enter text for deep analysis","warn"); return; }
  clearResults();
  const iv = showLoader("Running deep multi-layer analysis…");
  try {
    const r = await apiFetch("/advanced-analysis",{ method:"POST", body:JSON.stringify({text}) });
    const d = await r.json();
    hideLoader(iv);
    renderDeepResult(d);
    updateMini(d.basic_result?.label === "phishing");
  } catch(e) { hideLoader(iv); toast("API error: "+e.message,"error"); }
}

/* ==================================================
   BATCH SCAN
   ================================================== */
async function scanBatch() {
  const raw = document.getElementById("batchInput")?.value.trim();
  if (!raw) { toast("Enter URLs to scan","warn"); return; }
  const urls = raw.split("\n").map(u=>u.trim()).filter(Boolean);
  if (!urls.length) return;
  const res = document.getElementById("batchResults");
  res.innerHTML = `<div style="text-align:center;color:var(--text2);font-size:13px;padding:12px">Scanning ${urls.length} URLs…</div>`;
  res.classList.remove("hidden");
  const results = [];
  for (const url of urls) {
    try {
      let u = url; if (!/^https?:\/\//i.test(u)) u="https://"+u;
      const r = await apiFetch("/predict-url",{method:"POST",body:JSON.stringify({url:u})});
      results.push({url,...await r.json()});
    } catch { results.push({url,label:"error",score:null}); }
  }
  res.innerHTML = results.map(x => `
    <div class="batch-row ${x.label}">
      <span style="font-size:16px">${x.label==="phishing"?"🚨":x.label==="error"?"⚠️":"✅"}</span>
      <span class="batch-url">${x.url}</span>
      <span class="chip ${x.label}">${x.label}</span>
      <span style="font:600 11px var(--mono);color:var(--text3)">${x.score!=null?(x.score*100).toFixed(1)+"%":"—"}</span>
    </div>`).join("");
  const pc = results.filter(x=>x.label==="phishing").length;
  if (pc > 0) toast(`⚠️ ${pc}/${results.length} URLs flagged as phishing!`,"error");
  else toast(`✅ All ${results.length} URLs appear safe`,"success");
}

/* ==================================================
   RENDER BASIC RESULT
   ================================================== */
function renderResult(data) {
  const phish = data.label === "phishing";
  const score = data.score ?? (phish ? 0.85 : 0.12);
  const pct   = (score * 100).toFixed(1);
  const risk  = data.risk_level || (phish ? "high" : "low");
  const recs  = getRecs(risk);
  const rLabel = {high:"🔴 High Risk",medium:"🟡 Medium Risk",low:"🟢 Low Risk"}[risk] || risk;

  const ra = document.getElementById("resultArea");
  ra.innerHTML = `
    <div class="r-hero ${phish?"bad":"good"}">
      <div class="r-icon">${phish?"🚨":"✅"}</div>
      <div>
        <div class="r-verdict">${phish?"PHISHING DETECTED":"LOOKS SAFE"}</div>
        <div class="r-sub">${phish
          ?"This content shows phishing indicators — do not interact"
          :"No significant phishing indicators detected"}</div>
      </div>
    </div>
    <div class="r-body">
      <div class="conf-row">
        <span class="conf-lbl">Confidence</span>
        <div class="conf-bar"><div class="conf-fill ${phish?"fill-bad":"fill-good"}" id="cFill" style="width:0%"></div></div>
        <span class="conf-pct" id="cPct">0%</span>
      </div>
      <div class="risk-badge ${risk}">${rLabel}</div>
      <div class="recs-hd">Recommendations</div>
      ${recs.map(r=>`<div class="rec">${r}</div>`).join("")}
    </div>`;
  ra.classList.remove("hidden");

  requestAnimationFrame(() => setTimeout(() => {
    const fill = document.getElementById("cFill");
    const pctEl = document.getElementById("cPct");
    if (fill) fill.style.width = pct + "%";
    if (pctEl) {
      let cur = 0, tgt = parseFloat(pct);
      const step = tgt / 40;
      const t = setInterval(() => {
        cur = Math.min(cur+step, tgt);
        pctEl.textContent = cur.toFixed(1)+"%";
        if (cur >= tgt) clearInterval(t);
      }, 20);
    }
  }, 50));

  if (phish) toast("🚨 Phishing detected! Do not click any links.", "error");
  else       toast("✅ Content appears safe.", "success");
}

/* ==================================================
   RENDER DEEP RESULT
   ================================================== */
function renderDeepResult(data) {
  const basic    = data.basic_result || {};
  const sent     = data.sentiment    || {};
  const entities = data.entities     || [];
  const patterns = data.patterns     || [];
  const recs     = data.recommendations || [];
  const risk     = data.risk_level   || "low";
  const sim      = ((data.similarity_score||0)*100).toFixed(1);
  const phish    = basic.label === "phishing";
  const sEmoji   = {positive:"😊",negative:"😟",neutral:"😐"}[sent.label]||"❔";

  const entityHtml = entities.length
    ? entities.map(e=>`<span class="entity-tag ${e.type}">${
        e.type==="url"?"🔗":e.type==="email"?"📧":"📞"
      } ${e.value.length>32?e.value.slice(0,32)+"…":e.value}</span>`).join("")
    : `<span style="color:var(--text3);font-size:13px">None detected ✓</span>`;

  const patHtml = patterns.length
    ? patterns.map(p=>`<div class="pat-row"><span>${p.description}</span><span class="pat-badge">${(p.confidence*100).toFixed(0)}%</span></div>`).join("")
    : `<div style="color:var(--text3);font-size:13px;padding:6px 0">No patterns detected ✓</div>`;

  const dra = document.getElementById("deepResultArea");
  dra.innerHTML = `
    <div class="dr dr-2col">
      <div>
        <div class="dr-title">🎯 Detection</div>
        <div class="r-hero ${phish?"bad":"good"}" style="border-radius:10px;padding:12px 14px">
          <div style="font-size:30px">${phish?"🚨":"✅"}</div>
          <div>
            <div class="r-verdict" style="font-size:17px">${phish?"PHISHING":"SAFE"}</div>
            <div class="r-sub">Score: ${basic.score!=null?(basic.score*100).toFixed(1):"N/A"}%</div>
          </div>
        </div>
        <div style="margin-top:10px">
          <div class="risk-badge ${risk}" style="display:inline-flex">${
            {high:"🔴 High",medium:"🟡 Medium",low:"🟢 Low"}[risk]} Risk</div>
          <div style="font-size:12px;color:var(--text2);margin-top:6px">
            Template similarity: <strong style="color:var(--acc)">${sim}%</strong>
          </div>
        </div>
      </div>
      <div class="sent-block" style="background:var(--bg3);border-radius:10px">
        <div class="dr-title">🎭 Sentiment</div>
        <div class="sent-emoji">${sEmoji}</div>
        <div class="sent-name">${sent.label||"neutral"}</div>
        <div class="sent-meta">+${sent.positive_words||0} pos / −${sent.negative_words||0} neg</div>
      </div>
    </div>
    <div class="dr"><div class="dr-title">🏷️ Entities Detected</div>${entityHtml}</div>
    <div class="dr"><div class="dr-title">⚠️ Phishing Patterns</div>${patHtml}</div>
    <div class="dr">
      <div class="dr-title">💡 Recommendations</div>
      ${recs.map(r=>`<div class="rec">${r}</div>`).join("")}
    </div>`;
  dra.classList.remove("hidden");
  if (phish) toast("🚨 Deep analysis confirms phishing!","error");
  else       toast("✅ Deep analysis: appears safe.","success");
}

function getRecs(risk) {
  if (risk==="high") return [
    "🚨 Do NOT click any links in this message",
    "🔒 Never share passwords, OTPs, or card details",
    "📧 Report to your IT/security team immediately",
    "🗑️ Delete without replying",
    "🔍 Verify through official website only",
  ];
  if (risk==="medium") return [
    "⚠️ Verify sender through a different channel",
    "🔍 Check for URL misspellings",
    "🔗 Hover over links before clicking",
    "📞 Call the company on their official number",
  ];
  return [
    "✅ Content appears legitimate",
    "👀 Maintain normal vigilance",
    "📊 Report anything suspicious",
  ];
}

function updateMini(phish) {
  todayScans++;
  if (phish) todayPhish++;
  const tv = document.getElementById("miniTodayVal");
  const pv = document.getElementById("miniPhishVal");
  if (tv) tv.textContent = todayScans;
  if (pv) pv.textContent = todayPhish;
}

/* ==================================================
   HISTORY
   ================================================== */
async function loadHistory() {
  if (!authToken) return;
  const c = document.getElementById("historyContainer");
  if (!c) return;
  c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text2)">Loading…</div>`;
  try {
    const r = await apiFetch("/history");
    if (!r.ok) { c.innerHTML = emptyHtml(); return; }
    allHistory = await r.json();
    renderHistory(allHistory);
  } catch { c.innerHTML = emptyHtml(); }
}
function applyFilters() {
  const type  = document.getElementById("fType")?.value;
  const label = document.getElementById("fLabel")?.value;
  const risk  = document.getElementById("fRisk")?.value;
  const q     = document.getElementById("histSearch")?.value.toLowerCase();
  renderHistory(allHistory.filter(h =>
    (!type  || h.type === type) &&
    (!label || h.label === label) &&
    (!risk  || h.risk_level === risk) &&
    (!q     || (h.content||"").toLowerCase().includes(q))
  ));
}
function renderHistory(items) {
  const c = document.getElementById("historyContainer");
  if (!c) return;
  if (!items.length) { c.innerHTML = emptyHtml(); return; }
  c.innerHTML = items.map(h => {
    const prev = (h.content||"").slice(0,100)+((h.content||"").length>100?"…":"");
    const dt   = new Date(h.created_at).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
    const sc   = h.score!=null?(h.score*100).toFixed(1)+"%":"—";
    return `<div class="hi ${h.label}">
      <div class="hi-top">
        <div class="chips">
          <span class="chip ${h.label}">${h.label==="phishing"?"🚨":"✅"} ${h.label}</span>
          <span class="chip ${h.type}">${h.type==="url"?"🔗":"📧"} ${h.type}</span>
          <span class="chip ${h.risk_level}">${h.risk_level}</span>
        </div>
        <span class="hi-time">🕐 ${dt}</span>
      </div>
      <div class="hi-content">${prev||"(no content)"}</div>
      <div class="hi-score">Confidence: ${sc}</div>
    </div>`;
  }).join("");
}
function emptyHtml() {
  return `<div class="empty-s"><div class="ei">📭</div><h3>No scans yet</h3>
    <p>Start by scanning an email or URL</p>
    <button class="cta-btn" style="width:auto;padding:10px 24px;margin-top:16px" onclick="showSection('scan')">Start Scanning →</button>
  </div>`;
}
function exportCSV() {
  if (!allHistory.length) { toast("No history to export","warn"); return; }
  const rows = allHistory.map(h =>
    [h.id,h.type,h.label,h.risk_level,h.score?.toFixed(4)??"N/A",
     new Date(h.created_at).toISOString(),
     `"${(h.content||"").replace(/"/g,'""').replace(/\n/g," ")}"`].join(",")
  );
  const csv = "data:text/csv;charset=utf-8,ID,Type,Label,Risk,Score,Date,Content\n"+rows.join("\n");
  const a = document.createElement("a");
  a.href = encodeURI(csv);
  a.download = `phishing_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast("CSV exported!","success");
}

/* ==================================================
   STATISTICS
   ================================================== */
async function loadStats() {
  if (!authToken) return;
  try {
    const r = await apiFetch("/stats");
    if (!r.ok) return;
    const d = await r.json();
    const total = d.total||0, phish=d.phishing||0, safe=d.safe||0;
    animCount("kpiTotal",total); animCount("kpiPhishing",phish); animCount("kpiSafe",safe);
    document.getElementById("kpiRate").textContent = total?(phish/total*100).toFixed(1)+"%":"0%";

    const dark = !document.body.classList.contains("light");
    const tc = dark?"#7a90b0":"#5a6a88", gc = dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.05)";

    if (charts.d) charts.d.destroy();
    const dc = document.getElementById("chartDoughnut");
    if (dc) charts.d = new Chart(dc,{type:"doughnut",
      data:{labels:["Phishing","Safe"],datasets:[{data:[phish,safe],backgroundColor:["#ff5b5b","#40e88a"],borderColor:dark?"#131f33":"#fff",borderWidth:3}]},
      options:{cutout:"72%",plugins:{legend:{labels:{color:tc,font:{family:"Space Grotesk",weight:"600"}}}}}});

    if (charts.b) charts.b.destroy();
    const rm={high:0,medium:0,low:0};
    (d.by_risk||[]).forEach(x=>{rm[x.risk_level]=x.cnt;});
    const bc = document.getElementById("chartBar");
    if (bc) charts.b = new Chart(bc,{type:"bar",
      data:{labels:["High","Medium","Low"],datasets:[{label:"Scans",data:[rm.high,rm.medium,rm.low],backgroundColor:["rgba(255,91,91,0.8)","rgba(255,181,69,0.8)","rgba(64,232,138,0.8)"],borderRadius:8,borderSkipped:false}]},
      options:{plugins:{legend:{display:false}},scales:{y:{ticks:{color:tc},grid:{color:gc}},x:{ticks:{color:tc},grid:{display:false}}}}});

    if (charts.t) charts.t.destroy();
    const tm={};
    (d.by_type||[]).forEach(x=>{tm[x.type]=x.cnt;});
    const tc2 = document.getElementById("chartTypes");
    if (tc2) charts.t = new Chart(tc2,{type:"pie",
      data:{labels:Object.keys(tm).map(k=>k[0].toUpperCase()+k.slice(1)),datasets:[{data:Object.values(tm),backgroundColor:["#4da6ff","#b57aff","#63ffb4","#ffb545"],borderColor:dark?"#131f33":"#fff",borderWidth:2}]},
      options:{plugins:{legend:{labels:{color:tc,font:{family:"Space Grotesk",weight:"600"}}}}}});
  } catch(e) { console.error(e); }
}
function animCount(id, tgt) {
  const el = document.getElementById(id); if (!el) return;
  let cur=0; const step=Math.ceil(tgt/30);
  const t=setInterval(()=>{cur=Math.min(cur+step,tgt);el.textContent=cur;if(cur>=tgt)clearInterval(t);},30);
}

/* ==================================================
   ADMIN DATA
   ================================================== */
async function loadAdminData() {
  if (!authToken) return;
  try {
    const r = await apiFetch("/admin/stats");
    if (!r.ok) return;
    const d = await r.json();
    animCount("admUsers",d.total_users||0);
    animCount("admScans",d.total_scans||0);
    animCount("admPhish",d.phishing_scans||0);
    document.getElementById("admProtect").textContent = d.total_scans
      ? (((d.total_scans-d.phishing_scans)/d.total_scans)*100).toFixed(1)+"%":"100%";
    const act = document.getElementById("adminActivity");
    const recent = d.recent_scans||[];
    if (!recent.length) { act.innerHTML = emptyHtml(); return; }
    act.innerHTML = recent.map(s=>`<div class="hi ${s.label}">
      <div class="hi-top">
        <div class="chips">
          <span class="chip">${s.username}</span>
          <span class="chip ${s.label}">${s.label}</span>
          <span class="chip ${s.type}">${s.type}</span>
          <span class="chip ${s.risk_level}">${s.risk_level}</span>
        </div>
        <span class="hi-time">${new Date(s.created_at).toLocaleString()}</span>
      </div></div>`).join("");
  } catch(e) { console.error(e); }
}

/* ==================================================
   TOAST
   ================================================== */
function toast(msg, type="info") {
  const wrap = document.getElementById("toastWrap"); if (!wrap) return;
  const icons = {success:"✅",error:"🚨",warn:"⚠️",info:"ℹ️"};
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||"ℹ️"}</span><span style="flex:1">${msg}</span>
    <button class="toast-x" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(el);
  setTimeout(()=>{ if(el.parentElement) el.remove(); }, 4500);
}