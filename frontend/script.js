/* ==================================================
   AI Phishing Shield — Frontend Logic v3
   ================================================== */

const BASE = "https://ai-phishing-detection-x476.onrender.com";
const GOOGLE_CLIENT_ID = "634583123258-jitpku74o34oaijj17sefeh4iv99ujls.apps.googleusercontent.com";

let authToken = localStorage.getItem("authToken") || null;
let currentUser = null;
let allHistory = [];
let charts = {};
let todayScans = 0, todayPhish = 0;

/* ==================================================
   INIT
   ================================================== */
window.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  startMatrix();
  checkApiStatus();
  setInterval(checkApiStatus, 30000);

  // Google Sign-In
  if (typeof google !== "undefined") {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCallback,
      auto_select: false,
    });
    const cfg = { theme: "outline", size: "large", width: 320, shape: "pill" };
    const s1 = document.getElementById("googleSignInBtn");
    const s2 = document.getElementById("googleSignUpBtn");
    if (s1) google.accounts.id.renderButton(s1, cfg);
    if (s2) google.accounts.id.renderButton(s2, cfg);
  }

  // Auto-login from stored token
  if (authToken) {
    try {
      const r = await apiFetch("/auth/me");
      if (r.ok) {
        currentUser = await r.json();
        enterApp();
      } else {
        clearAuth();
      }
    } catch {
      clearAuth();
    }
  }
});

/* ==================================================
   MATRIX RAIN BACKGROUND
   ================================================== */
function startMatrix() {
  const canvas = document.getElementById("matrixCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener("resize", () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / 20);
    drops = Array(cols).fill(1);
  });
  const chars = "01アイウエオカキクケコサシスセソタチツテトナニヌネノ";
  let cols  = Math.floor(canvas.width / 20);
  let drops = Array(cols).fill(1);
  setInterval(() => {
    ctx.fillStyle = "rgba(8,14,26,0.04)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#63ffb4";
    ctx.font = "13px monospace";
    drops.forEach((y, i) => {
      const char = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(char, i * 20, y * 20);
      if (y * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    });
  }, 60);
}

/* ==================================================
   THEME
   ================================================== */
function applyTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.body.classList.add("light");
    const btn = document.getElementById("themeBtn");
    if (btn) btn.textContent = "☀️";
  }
}

function toggleTheme() {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  document.getElementById("themeBtn").textContent = isLight ? "☀️" : "🌙";
  // Redraw charts with new theme
  if (document.getElementById("sectionStats") && !document.getElementById("sectionStats").classList.contains("hidden")) {
    loadStats();
  }
}

/* ==================================================
   API HELPER
   ================================================== */
async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return fetch(BASE + path, { ...opts, headers });
}

/* ==================================================
   API STATUS CHECK
   ================================================== */
async function checkApiStatus() {
  const dot = document.querySelector(".dot");
  const lbl = document.querySelector(".status-label");
  try {
    const r = await fetch(BASE + "/health", { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      if (dot) { dot.classList.add("online"); dot.classList.remove("offline"); }
      if (lbl) lbl.textContent = "Online";
    } else throw new Error();
  } catch {
    if (dot) { dot.classList.add("offline"); dot.classList.remove("online"); }
    if (lbl) lbl.textContent = "Offline";
  }
}

/* ==================================================
   AUTH TAB SWITCHING
   ================================================== */
function switchTab(tab) {
  ["loginForm","registerForm","forgotForm"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById("tabLogin").classList.toggle("active", tab === "login");
  document.getElementById("tabRegister").classList.toggle("active", tab === "register");
  if (tab === "login")    document.getElementById("loginForm").classList.remove("hidden");
  if (tab === "register") document.getElementById("registerForm").classList.remove("hidden");
  if (tab === "forgot")   document.getElementById("forgotForm").classList.remove("hidden");
}

function showForgot() {
  ["loginForm","registerForm"].forEach(id => document.getElementById(id).classList.add("hidden"));
  document.getElementById("forgotForm").classList.remove("hidden");
  document.getElementById("tabLogin").classList.remove("active");
  document.getElementById("tabRegister").classList.remove("active");
}

function togglePass(id, btn) {
  const el = document.getElementById(id);
  el.type = el.type === "password" ? "text" : "password";
  btn.textContent = el.type === "password" ? "👁" : "🙈";
}

function updateStrength(val) {
  let score = 0;
  if (val.length >= 6) score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const fill = document.getElementById("strengthFill");
  const text = document.getElementById("strengthText");
  if (!fill) return;
  const pct = (score / 5) * 100;
  fill.style.width = pct + "%";
  const levels = ["","Weak","Weak","Fair","Strong","Very strong"];
  const colors = ["","#ff5b5b","#ff8c00","#ffb545","#40e88a","#63ffb4"];
  fill.style.background = colors[score] || "#63ffb4";
  if (text) { text.textContent = levels[score] || ""; text.style.color = colors[score] || ""; }
}

function setMsg(id, msg, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "msg-area " + type;
}

/* ==================================================
   GOOGLE AUTH
   ================================================== */
async function handleGoogleCallback(response) {
  toast("Verifying Google credentials...", "info");
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
  } catch (e) {
    toast("Google login error: " + e.message, "error");
  }
}

/* ==================================================
   LOGIN
   ================================================== */
async function login() {
  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value;
  if (!username || !password) {
    setMsg("loginMsg", "Please enter username and password", "err"); return;
  }
  setMsg("loginMsg", "Signing in...", "");
  try {
    const r = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json();
    if (!r.ok) { setMsg("loginMsg", data.detail || "Invalid credentials", "err"); return; }
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem("authToken", authToken);
    enterApp();
  } catch (e) {
    setMsg("loginMsg", "Network error — is the API running?", "err");
  }
}

/* ==================================================
   REGISTER
   ================================================== */
async function register() {
  const username = document.getElementById("regUser").value.trim();
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPass").value;
  if (!username || !password) { setMsg("registerMsg", "Username and password are required", "err"); return; }
  if (password.length < 6)   { setMsg("registerMsg", "Password must be at least 6 characters", "err"); return; }
  setMsg("registerMsg", "Creating account...", "");
  try {
    const r = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
    const data = await r.json();
    if (!r.ok) { setMsg("registerMsg", data.detail || "Registration failed", "err"); return; }
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem("authToken", authToken);
    enterApp();
  } catch (e) {
    setMsg("registerMsg", "Network error — is the API running?", "err");
  }
}

/* ==================================================
   FORGOT / RESET PASSWORD
   ================================================== */
function sendReset() {
  const u = document.getElementById("forgotUser").value.trim();
  if (!u) { setMsg("forgotMsg", "Please enter your username", "err"); return; }
  setMsg("forgotMsg", "✅ Reset instructions will be sent if the account exists.", "ok");
  setTimeout(() => {
    document.getElementById("forgotStep1").classList.add("hidden");
    document.getElementById("forgotStep2").classList.remove("hidden");
  }, 1500);
}

function resetPassword() {
  const np = document.getElementById("newPass").value;
  const cp = document.getElementById("confirmPass").value;
  if (!np || !cp) { setMsg("resetMsg", "Please fill all fields", "err"); return; }
  if (np !== cp)  { setMsg("resetMsg", "Passwords do not match", "err"); return; }
  setMsg("resetMsg", "✅ Password reset successfully!", "ok");
  setTimeout(() => switchTab("login"), 1500);
}

/* ==================================================
   ENTER APP  ← KEY FIX: use classList, not style
   ================================================== */
function enterApp() {
  // FIX: remove 'hidden' class instead of setting style.display
  document.getElementById("authSection").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");

  // Set user info
  const uname = currentUser?.username || "User";
  const role  = currentUser?.role || "user";
  const avatar = currentUser?.avatar ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uname)}`;

  const sbName = document.getElementById("sidebarUsername");
  const sbRole = document.getElementById("sidebarRole");
  const sbAv   = document.getElementById("sidebarAvatar");
  if (sbName) sbName.textContent = uname;
  if (sbRole) sbRole.textContent = role === "admin" ? "Administrator" : "Member";
  if (sbAv)   sbAv.src = avatar;

  if (role === "admin") {
    document.getElementById("snav-admin").style.display = "flex";
  }

  // Clear inputs
  ["loginUser","loginPass","regUser","regEmail","regPass"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  showSection("scan");
  toast(`Welcome back, ${uname}! 👋`, "success");
}

/* ==================================================
   LOGOUT
   ================================================== */
function logout() {
  clearAuth();
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("authSection").classList.remove("hidden");
  toast("Logged out successfully", "info");
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem("authToken");
}

/* ==================================================
   SIDEBAR & SECTION NAV
   ================================================== */
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

function showSection(name) {
  const sections = ["Scan","History","Stats","Admin"];
  sections.forEach(s => {
    const el = document.getElementById("section" + s);
    if (el) el.classList.add("hidden");
    const btn = document.getElementById("snav-" + s.toLowerCase());
    if (btn) btn.classList.remove("active");
  });

  const target = document.getElementById("section" + name.charAt(0).toUpperCase() + name.slice(1));
  if (target) target.classList.remove("hidden");

  const activeBtn = document.getElementById("snav-" + name);
  if (activeBtn) activeBtn.classList.add("active");

  const titles = { scan:"Threat Scanner", history:"Scan History", stats:"Statistics", admin:"Admin Dashboard" };
  const tb = document.getElementById("topbarTitle");
  if (tb) tb.textContent = titles[name] || "Dashboard";

  // Load data when switching sections
  if (name === "history") loadHistory();
  if (name === "stats")   loadStats();
  if (name === "admin")   loadAdminData();

  // Close sidebar on mobile
  if (window.innerWidth < 768) {
    document.getElementById("sidebar").classList.remove("open");
  }
}

/* ==================================================
   SCAN TAB SWITCHING
   ================================================== */
function switchScanTab(tab) {
  ["text","url","deep","batch"].forEach(t => {
    document.getElementById("panel-" + t).classList.add("hidden");
    document.getElementById("stab-" + t).classList.remove("active");
  });
  document.getElementById("panel-" + tab).classList.remove("hidden");
  document.getElementById("stab-" + tab).classList.add("active");
  hideResults();
}

function hideResults() {
  document.getElementById("resultArea").classList.add("hidden");
  document.getElementById("deepResultArea").classList.add("hidden");
  document.getElementById("batchResults")?.classList.add("hidden");
}

/* ==================================================
   INPUT HELPERS
   ================================================== */
function updateCharCount(el, countId, max) {
  const el2 = document.getElementById(countId);
  if (el2) {
    el2.textContent = `${el.value.length} / ${max}`;
    el2.style.color = el.value.length > max * 0.9 ? "var(--amber)" : "";
  }
}

function clearInput(inputId, countId, max) {
  const el = document.getElementById(inputId);
  if (el) el.value = "";
  updateCharCount({ value:"" }, countId, max);
  hideResults();
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const el = document.getElementById("urlInput");
    if (el) el.value = text.replace(/^https?:\/\//,"");
    toast("Pasted from clipboard", "info");
  } catch {
    toast("Enable clipboard permission to paste", "warn");
  }
}

function fillExample(type, variant) {
  if (type === "text") {
    const phish = `URGENT NOTICE: Your PayPal account has been suspended due to suspicious activity. 
You must verify your account immediately to restore access.
Click here: http://paypa1-secure-verify.com/login
Failure to act within 24 hours will result in permanent account closure.
Please provide your login credentials and billing information to continue.`;
    const safe = `Hi Sarah, 
Just wanted to confirm our meeting tomorrow at 3 PM. 
The agenda will include Q3 review and planning for next quarter.
Please bring the spreadsheets we discussed last week.
Best regards, Mike`;
    document.getElementById("textInput").value = variant === "phish" ? phish : safe;
    updateCharCount(document.getElementById("textInput"), "textCount", 2000);
  } else {
    const u = variant === "phish"
      ? "http://paypa1-secure-login.verification-update.com/account/verify"
      : "https://google.com";
    document.getElementById("urlInput").value = u.replace(/^https?:\/\//,"");
  }
}

/* ==================================================
   SCAN LOADER
   ================================================== */
const scanSteps = [
  "Loading ML models...",
  "Tokenizing input...",
  "Running classifier...",
  "Calculating confidence...",
  "Analyzing patterns...",
  "Generating report..."
];

function showLoader(msg = "Analyzing...") {
  const loader = document.getElementById("scanLoader");
  const text   = document.getElementById("loaderText");
  const steps  = document.getElementById("loaderSteps");
  loader.classList.remove("hidden");
  text.textContent = msg;
  steps.innerHTML = "";
  let i = 0;
  const interval = setInterval(() => {
    if (i < scanSteps.length) {
      const line = document.createElement("div");
      line.textContent = "▶ " + scanSteps[i];
      steps.appendChild(line);
      i++;
    } else {
      clearInterval(interval);
    }
  }, 300);
  return interval;
}

function hideLoader() {
  document.getElementById("scanLoader").classList.add("hidden");
}

/* ==================================================
   SCAN TEXT
   ================================================== */
async function scanText() {
  const text = document.getElementById("textInput").value.trim();
  if (!text) { toast("Please enter some text to analyze", "warn"); return; }
  hideResults();
  const interval = showLoader("Analyzing text for phishing signals...");
  try {
    const r = await apiFetch("/predict-text", {
      method: "POST", body: JSON.stringify({ text })
    });
    const data = await r.json();
    clearInterval(interval);
    hideLoader();
    renderResult(data);
    updateMiniStats(data.label === "phishing");
  } catch (e) {
    clearInterval(interval); hideLoader();
    toast("API error: " + e.message, "error");
  }
}

/* ==================================================
   SCAN URL
   ================================================== */
async function scanUrl() {
  let raw = document.getElementById("urlInput").value.trim();
  if (!raw) { toast("Please enter a URL", "warn"); return; }
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  hideResults();
  const interval = showLoader("Scanning URL for threats...");
  try {
    const r = await apiFetch("/predict-url", {
      method: "POST", body: JSON.stringify({ url: raw })
    });
    const data = await r.json();
    clearInterval(interval); hideLoader();
    renderResult(data, "url", raw);
    updateMiniStats(data.label === "phishing");
  } catch (e) {
    clearInterval(interval); hideLoader();
    toast("API error: " + e.message, "error");
  }
}

/* ==================================================
   DEEP ANALYSIS
   ================================================== */
async function scanDeep() {
  const text = document.getElementById("deepInput").value.trim();
  if (!text) { toast("Please enter text for deep analysis", "warn"); return; }
  hideResults();
  const interval = showLoader("Running deep multi-layer analysis...");
  try {
    const r = await apiFetch("/advanced-analysis", {
      method: "POST", body: JSON.stringify({ text })
    });
    const data = await r.json();
    clearInterval(interval); hideLoader();
    renderDeepResult(data);
    updateMiniStats(data.basic_result?.label === "phishing");
  } catch (e) {
    clearInterval(interval); hideLoader();
    toast("API error: " + e.message, "error");
  }
}

/* ==================================================
   BATCH SCAN
   ================================================== */
async function scanBatch() {
  const raw = document.getElementById("batchInput").value.trim();
  if (!raw) { toast("Please enter URLs to scan", "warn"); return; }
  const urls = raw.split("\n").map(u => u.trim()).filter(Boolean);
  if (!urls.length) { toast("No valid URLs found", "warn"); return; }

  const resultsEl = document.getElementById("batchResults");
  resultsEl.innerHTML = `<div style="text-align:center;color:var(--text2);font-size:13px">Scanning ${urls.length} URLs...</div>`;
  resultsEl.classList.remove("hidden");

  const results = [];
  for (const url of urls) {
    try {
      let u = url;
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      const r = await apiFetch("/predict-url", {
        method:"POST", body: JSON.stringify({ url: u })
      });
      const data = await r.json();
      results.push({ url, ...data });
    } catch {
      results.push({ url, label:"error", score:null });
    }
  }

  resultsEl.innerHTML = results.map(res => {
    const isPhish = res.label === "phishing";
    const scoreStr = res.score != null ? (res.score * 100).toFixed(1) + "%" : "—";
    return `
      <div class="batch-row ${res.label}">
        <span style="font-size:18px">${isPhish ? "🚨" : res.label === "error" ? "⚠️" : "✅"}</span>
        <span class="batch-url">${res.url}</span>
        <span class="chip ${res.label}">${res.label}</span>
        <span style="font:600 12px var(--mono);color:var(--text3)">${scoreStr}</span>
      </div>
    `;
  }).join("");

  const phishCount = results.filter(r => r.label === "phishing").length;
  if (phishCount > 0) {
    toast(`⚠️ ${phishCount} of ${results.length} URLs flagged as phishing!`, "error");
  } else {
    toast(`✅ All ${results.length} URLs appear safe`, "success");
  }
}

/* ==================================================
   RENDER BASIC RESULT
   ================================================== */
function renderResult(data, type = "text", urlVal = "") {
  const isPhish = data.label === "phishing";
  const score   = data.score != null ? data.score : (isPhish ? 0.85 : 0.12);
  const pct     = (score * 100).toFixed(1);
  const risk    = data.risk_level || (isPhish ? "high" : "low");
  const recs    = getRecommendations(risk);
  const label   = isPhish ? "PHISHING DETECTED" : "LOOKS SAFE";
  const icon    = isPhish ? "🚨" : "✅";
  const heroClass = isPhish ? "danger-hero" : "safe-hero";
  const fillClass = isPhish ? "fill-danger" : "fill-safe";
  const riskLabel = { high:"🔴 High Risk", medium:"🟡 Medium Risk", low:"🟢 Low Risk" }[risk] || risk;
  const sub = isPhish
    ? "This content contains phishing indicators — proceed with extreme caution"
    : "No significant phishing indicators detected in this content";

  const ra = document.getElementById("resultArea");
  ra.innerHTML = `
    <div class="result-hero ${heroClass}">
      <div class="result-big">${icon}</div>
      <div>
        <div class="result-verdict">${label}</div>
        <div class="result-sub">${sub}</div>
      </div>
    </div>
    <div class="result-body">
      <div class="confidence-row">
        <span class="conf-label">Confidence</span>
        <div class="conf-bar">
          <div class="conf-fill ${fillClass}" id="confFill" style="width:0%"></div>
        </div>
        <span class="conf-pct" id="confPct">0%</span>
      </div>
      <div class="risk-chip ${risk}">${riskLabel}</div>
      <div class="recs-title">Security Recommendations</div>
      <div class="rec-list">
        ${recs.map(r => `<div class="rec-item">${r}</div>`).join("")}
      </div>
    </div>
  `;
  ra.classList.remove("hidden");

  // Animate confidence bar
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = document.getElementById("confFill");
      const pctEl = document.getElementById("confPct");
      if (fill) fill.style.width = pct + "%";
      if (pctEl) {
        let current = 0;
        const target = parseFloat(pct);
        const step = target / 40;
        const timer = setInterval(() => {
          current = Math.min(current + step, target);
          pctEl.textContent = current.toFixed(1) + "%";
          if (current >= target) clearInterval(timer);
        }, 20);
      }
    }, 50);
  });

  if (isPhish) toast("🚨 Phishing content detected! Do not interact.", "error");
  else toast("✅ Content appears to be safe.", "success");
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
  const sim      = ((data.similarity_score || 0) * 100).toFixed(1);

  const sentEmoji = { positive:"😊", negative:"😟", neutral:"😐" }[sent.label] || "❔";
  const isPhish = basic.label === "phishing";

  const entityHtml = entities.length
    ? entities.map(e => `<span class="entity-chip ${e.type}" title="Risk: ${e.risk}">${
        e.type === "url" ? "🔗" : e.type === "email" ? "📧" : "📞"
      } ${e.value.length > 35 ? e.value.slice(0,35) + "…" : e.value}</span>`).join("")
    : `<span style="color:var(--text3);font-size:13px">No entities detected ✓</span>`;

  const patternHtml = patterns.length
    ? patterns.map(p => `
        <div class="pattern-row">
          <span>${p.description}</span>
          <span class="conf-badge">${(p.confidence * 100).toFixed(0)}%</span>
        </div>`).join("")
    : `<div style="color:var(--text3);font-size:13px;padding:8px 0">No suspicious patterns detected ✓</div>`;

  const recsHtml = recs.map(r => `<div class="rec-item">${r}</div>`).join("");

  const dra = document.getElementById("deepResultArea");
  dra.innerHTML = `
    <div class="dr-card dr-grid2">
      <div class="dr-card" style="border:none;padding:0">
        <div class="dr-card-title">🎯 Detection Result</div>
        <div class="result-hero ${isPhish ? "danger-hero" : "safe-hero"}" style="border-radius:10px;padding:14px 16px">
          <div style="font-size:32px">${isPhish ? "🚨" : "✅"}</div>
          <div>
            <div class="result-verdict" style="font-size:18px">${isPhish ? "PHISHING" : "SAFE"}</div>
            <div class="result-sub">Score: ${basic.score != null ? (basic.score*100).toFixed(1) : "N/A"}%</div>
          </div>
        </div>
        <div style="margin-top:10px">
          <div class="risk-chip ${risk}" style="display:inline-flex">
            ${{ high:"🔴 High", medium:"🟡 Medium", low:"🟢 Low" }[risk]} Risk
          </div>
          <div style="font-size:13px;color:var(--text2);margin-top:8px">
            Template similarity: <strong style="color:var(--accent)">${sim}%</strong>
          </div>
        </div>
      </div>
      <div class="sentiment-block" style="background:var(--bg3);border-radius:10px">
        <div class="dr-card-title" style="margin-bottom:0">🎭 Sentiment</div>
        <div class="sent-emoji">${sentEmoji}</div>
        <div class="sent-label">${sent.label || "neutral"}</div>
        <div class="sent-meta">+${sent.positive_words||0} positive / −${sent.negative_words||0} negative</div>
      </div>
    </div>
    <div class="dr-card">
      <div class="dr-card-title">🏷️ Detected Entities</div>
      ${entityHtml}
    </div>
    <div class="dr-card">
      <div class="dr-card-title">⚠️ Phishing Patterns</div>
      ${patternHtml}
    </div>
    <div class="dr-card">
      <div class="dr-card-title">💡 Security Recommendations</div>
      <div class="rec-list">${recsHtml}</div>
    </div>
  `;
  dra.classList.remove("hidden");

  if (isPhish) toast("🚨 Deep analysis confirms phishing content!", "error");
  else toast("✅ Deep analysis: content appears safe.", "success");
}

/* ==================================================
   RECOMMENDATIONS
   ================================================== */
function getRecommendations(risk) {
  if (risk === "high") return [
    "🚨 Do NOT click any links in this message",
    "🔒 Never provide passwords, card details, or personal info",
    "📧 Report this to your IT/security team immediately",
    "🗑️ Delete this message without replying",
    "🔍 Verify any claim through official company websites only",
  ];
  if (risk === "medium") return [
    "⚠️ Verify the sender's identity through a different channel",
    "🔍 Check for subtle misspellings in URLs and domain names",
    "🔗 Hover over links before clicking — check the actual destination",
    "📞 Call the company directly using their official phone number",
  ];
  return [
    "✅ Content appears legitimate",
    "👀 Maintain normal vigilance as always",
    "📊 Report anything suspicious you notice later",
  ];
}

/* ==================================================
   MINI STATS UPDATE
   ================================================== */
function updateMiniStats(isPhish) {
  todayScans++;
  if (isPhish) todayPhish++;
  const tv = document.getElementById("miniTodayVal");
  const pv = document.getElementById("miniPhishVal");
  if (tv) { tv.textContent = todayScans; tv.style.animation = "none"; void tv.offsetWidth; tv.style.animation = ""; }
  if (pv) { pv.textContent = todayPhish; }
}

/* ==================================================
   HISTORY
   ================================================== */
async function loadHistory() {
  if (!authToken) return;
  const container = document.getElementById("historyContainer");
  container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text2)">Loading...</div>`;
  try {
    const r = await apiFetch("/history");
    if (!r.ok) { container.innerHTML = renderEmpty(); return; }
    allHistory = await r.json();
    renderHistory(allHistory);
  } catch {
    container.innerHTML = renderEmpty();
  }
}

function applyFilters() {
  const type   = document.getElementById("fType").value;
  const label  = document.getElementById("fLabel").value;
  const risk   = document.getElementById("fRisk").value;
  const search = document.getElementById("histSearch").value.toLowerCase();
  const filtered = allHistory.filter(h =>
    (!type   || h.type  === type)  &&
    (!label  || h.label === label) &&
    (!risk   || h.risk_level === risk) &&
    (!search || (h.content||"").toLowerCase().includes(search))
  );
  renderHistory(filtered);
}

function renderHistory(items) {
  const container = document.getElementById("historyContainer");
  if (!items.length) { container.innerHTML = renderEmpty(); return; }
  container.innerHTML = items.map(h => {
    const preview = (h.content||"").slice(0,100) + ((h.content||"").length > 100 ? "…" : "");
    const dt = new Date(h.created_at).toLocaleString("en-IN", {
      day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"
    });
    const scoreStr = h.score != null ? (h.score*100).toFixed(1)+"%" : "—";
    return `
      <div class="hist-item ${h.label}">
        <div class="hist-top">
          <div class="hist-chips">
            <span class="chip ${h.label}">${h.label === "phishing" ? "🚨" : "✅"} ${h.label}</span>
            <span class="chip ${h.type}">${h.type === "url" ? "🔗" : "📧"} ${h.type}</span>
            <span class="chip ${h.risk_level}">${h.risk_level} risk</span>
          </div>
          <span class="hist-time">🕐 ${dt}</span>
        </div>
        <div class="hist-content">${preview || "(no content)"}</div>
        <div class="hist-score">Confidence: ${scoreStr}</div>
      </div>
    `;
  }).join("");
}

function renderEmpty() {
  return `<div class="empty-state">
    <div class="es-icon">📭</div>
    <h3>No scans yet</h3>
    <p>Start scanning emails or URLs to see your history here</p>
    <button class="btn-cta" style="margin-top:16px;width:auto;padding:10px 24px" onclick="showSection('scan')">Start Scanning →</button>
  </div>`;
}

function exportCSV() {
  if (!allHistory.length) { toast("No history to export", "warn"); return; }
  const headers = ["ID","Type","Label","Risk","Score","Date","Content"];
  const rows = allHistory.map(h => [
    h.id, h.type, h.label, h.risk_level,
    h.score?.toFixed(4) ?? "N/A",
    new Date(h.created_at).toISOString(),
    `"${(h.content||"").replace(/"/g,'""').replace(/\n/g," ")}"`,
  ].join(","));
  const csv = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
  const a = document.createElement("a");
  a.href = encodeURI(csv);
  a.download = `phishing_history_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast("CSV downloaded!", "success");
}

/* ==================================================
   STATISTICS
   ================================================== */
async function loadStats() {
  if (!authToken) return;
  try {
    const r = await apiFetch("/stats");
    if (!r.ok) return;
    const data = await r.json();

    const total   = data.total    || 0;
    const phish   = data.phishing || 0;
    const safe    = data.safe     || 0;
    const rate    = total ? ((phish/total)*100).toFixed(1) + "%" : "0%";

    animateCount("kpiTotal",    total);
    animateCount("kpiPhishing", phish);
    animateCount("kpiSafe",     safe);
    document.getElementById("kpiRate").textContent = rate;

    const isDark = !document.body.classList.contains("light");
    const textColor = isDark ? "#7a90b0" : "#5a6a88";
    const gridColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";

    // Doughnut
    if (charts.doughnut) charts.doughnut.destroy();
    const dCtx = document.getElementById("chartDoughnut");
    if (dCtx) {
      charts.doughnut = new Chart(dCtx, {
        type: "doughnut",
        data: {
          labels: ["Phishing", "Safe"],
          datasets: [{
            data: [phish, safe],
            backgroundColor: ["#ff5b5b","#40e88a"],
            borderColor: isDark ? "#131f33" : "#ffffff",
            borderWidth: 3,
          }]
        },
        options: {
          cutout: "72%",
          plugins: {
            legend: { labels: { color: textColor, font: { family:"Space Grotesk", weight:"600" } } }
          },
        }
      });
    }

    // Bar (risk)
    if (charts.bar) charts.bar.destroy();
    const riskMap = { high:0, medium:0, low:0 };
    (data.by_risk || []).forEach(r => { riskMap[r.risk_level] = r.cnt; });
    const bCtx = document.getElementById("chartBar");
    if (bCtx) {
      charts.bar = new Chart(bCtx, {
        type: "bar",
        data: {
          labels: ["High Risk","Med Risk","Low Risk"],
          datasets: [{
            label:"Scans",
            data: [riskMap.high, riskMap.medium, riskMap.low],
            backgroundColor: ["rgba(255,91,91,0.8)","rgba(255,181,69,0.8)","rgba(64,232,138,0.8)"],
            borderRadius: 8, borderSkipped: false,
          }]
        },
        options: {
          plugins: { legend:{ display:false } },
          scales: {
            y: { ticks:{ color:textColor }, grid:{ color:gridColor } },
            x: { ticks:{ color:textColor }, grid:{ display:false } }
          }
        }
      });
    }

    // Types (pie)
    if (charts.types) charts.types.destroy();
    const typeMap = {};
    (data.by_type || []).forEach(t => { typeMap[t.type] = t.cnt; });
    const tCtx = document.getElementById("chartTypes");
    if (tCtx) {
      charts.types = new Chart(tCtx, {
        type: "pie",
        data: {
          labels: Object.keys(typeMap).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
          datasets: [{
            data: Object.values(typeMap),
            backgroundColor: ["#4da6ff","#b57aff","#63ffb4","#ffb545"],
            borderColor: isDark ? "#131f33" : "#ffffff",
            borderWidth: 2,
          }]
        },
        options: {
          plugins: { legend: { labels: { color: textColor, font: { family:"Space Grotesk", weight:"600" } } } }
        }
      });
    }

  } catch (e) {
    console.error("Stats error:", e);
  }
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.ceil(target / 30);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(timer);
  }, 30);
}

/* ==================================================
   ADMIN DATA
   ================================================== */
async function loadAdminData() {
  if (!authToken) return;
  try {
    const r = await apiFetch("/admin/stats");
    if (!r.ok) return;
    const data = await r.json();

    animateCount("admUsers",  data.total_users   || 0);
    animateCount("admScans",  data.total_scans   || 0);
    animateCount("admPhish",  data.phishing_scans || 0);
    const protect = data.total_scans
      ? (((data.total_scans - data.phishing_scans) / data.total_scans) * 100).toFixed(1) + "%"
      : "100%";
    document.getElementById("admProtect").textContent = protect;

    const act = document.getElementById("adminActivity");
    const recent = data.recent_scans || [];
    if (!recent.length) { act.innerHTML = renderEmpty(); return; }
    act.innerHTML = recent.map(s => `
      <div class="hist-item ${s.label}">
        <div class="hist-top">
          <div class="hist-chips">
            <span class="chip">${s.username}</span>
            <span class="chip ${s.label}">${s.label}</span>
            <span class="chip ${s.type}">${s.type}</span>
            <span class="chip ${s.risk_level}">${s.risk_level}</span>
          </div>
          <span class="hist-time">${new Date(s.created_at).toLocaleString()}</span>
        </div>
      </div>
    `).join("");
  } catch (e) {
    console.error("Admin error:", e);
  }
}

/* ==================================================
   TOAST NOTIFICATIONS
   ================================================== */
function toast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const icons = { success:"✅", error:"🚨", warn:"⚠️", info:"ℹ️" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || "ℹ️"}</span> <span style="flex:1">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(el);
  setTimeout(() => { if (el.parentElement) el.remove(); }, 4000);
}