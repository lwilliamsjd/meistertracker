import { supabase } from "./supabase-client.js";
import {
  signIn,
  signOut,
  getSession,
  getCurrentProfile,
  listTeam,
  setDisplayName,
  changePassword,
  listMeisters,
  listMeisterRollups,
  getMeister,
  createMeister,
  updateMeister,
  deleteMeister,
  listInteractions,
  addInteraction,
  deleteInteraction,
  listCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  countCategoryUses,
  setInteractionCategory,
  fetchAnalyticsData,
  listGuests,
  addGuest,
  updateGuest,
  deleteGuest,
  listFollowUpsForMeister,
  listMyFollowUps,
  listRecentDoneFollowUps,
  countMyDueFollowUps,
  addFollowUp,
  updateFollowUp,
  deleteFollowUp,
  listCommentsForInteractions,
  listCommentCounts,
  addComment,
  updateComment,
  deleteComment,
  listRecentActivity,
  subscribeToChanges,
  setNotificationPrefs,
  listNotifications,
  listUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markMeisterNotificationsRead,
} from "./api.js";
import { exportToExcel } from "./export.js";

const app = document.getElementById("app");
let currentProfile = null;
let unsubscribeRealtime = null;
let myDueCount = 0;
let myUnread = []; // [{id, meister_id}] unread notifications for the signed-in user
let categories = []; // question categories (all, including retired)
const activeCategories = () => categories.filter((c) => c.active);
const catById = (id) => categories.find((c) => c.id === id);

const STATUSES = ["New", "Contacted", "Engaged", "Sold", "Not Interested"];
const CONCIERGES = ["Freddie", "Logan"];
const METHODS = ["Phone", "Text", "Email", "In Person", "Other"];

// ============================================================
// ICONS  (inline SVG, inherit currentColor — consistent on every OS)
// ============================================================
const I = {
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>`,
  note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  person: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  calendarPlus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15v-4M12 15V7M17 15v-2"/></svg>`,
};

const METHOD_ICON = { Phone: I.phone, Text: I.text, Email: I.mail, "In Person": I.person, Other: I.other };
const QUICK_ACTIONS = [
  { label: "Call", icon: I.phone, method: "Phone" },
  { label: "Text", icon: I.text, method: "Text" },
  { label: "Email", icon: I.mail, method: "Email" },
  { label: "Note", icon: I.note, method: "Other" },
];

// ============================================================
// STATE
// ============================================================
let uiState = freshUiState("activity");
function freshUiState(tab) {
  return {
    activeTab: tab,
    composerOpen: false,
    composerMethod: "Phone",
    composerWithFollowUp: false,
    methodFilter: "",
    guestFormOpen: false,
    editingGuestId: null,
    fuFormOpen: false,
    editingFuId: null,
    replyingTo: null,
    editingCommentId: null,
    focusId: null,
  };
}

const dashState = { q: "", status: "", concierge: "", sort: "updated", dir: "desc" };
const actState = { q: "", method: "", person: "", category: "" };
const fuPageState = { showDone: false, editingId: null };
const anaState = { range: "30d", from: "", to: "", concierge: "", drill: null };
const catMgrState = { editingId: null };

// Draft preservation: anything typed into a [data-draft] field survives a
// re-render. Only DIRTY fields are captured, so fresh server values still
// win when the user hasn't touched a field.
let drafts = {};
let draftsRouteKey = null;

function captureDrafts() {
  document.querySelectorAll("#main-content [data-draft]").forEach((el) => {
    let dirty;
    if (el.tagName === "SELECT") {
      const def = [...el.options].find((o) => o.defaultSelected) || el.options[0];
      dirty = def ? def.value !== el.value : true;
    } else {
      dirty = el.value !== el.defaultValue;
    }
    // Once a field has a draft it stays sticky (re-rendering it makes it look
    // "clean" again), otherwise only capture fields the user actually changed.
    if (dirty || el.id in drafts) drafts[el.id] = el.value;
  });
}
function dv(id, fallback = "") {
  return id in drafts ? drafts[id] : fallback ?? "";
}
function clearDrafts(prefix) {
  for (const k of Object.keys(drafts)) if (!prefix || k.startsWith(prefix)) delete drafts[k];
}

// ============================================================
// ROUTER
// ============================================================
window.addEventListener("hashchange", () => render());
window.addEventListener("DOMContentLoaded", init);

async function init() {
  if (!document.getElementById("toast-root")) {
    const tr = document.createElement("div");
    tr.id = "toast-root";
    document.body.appendChild(tr);
  }
  const session = await getSession();
  if (session) {
    currentProfile = await getCurrentProfile();
    startRealtime();
  }
  render();

  supabase.auth.onAuthStateChange(async (event) => {
    if (event === "SIGNED_IN") {
      const alreadySignedIn = !!currentProfile;
      currentProfile = await getCurrentProfile();
      if (!alreadySignedIn) {
        startRealtime();
        navigate("#/dashboard");
      }
    } else if (event === "SIGNED_OUT") {
      currentProfile = null;
      if (unsubscribeRealtime) unsubscribeRealtime();
      navigate("#/login");
    }
  });
}

function startRealtime() {
  if (unsubscribeRealtime) unsubscribeRealtime();
  unsubscribeRealtime = subscribeToChanges(() => {
    const route = parseHash();
    if (route.name !== "login" && !(route.name === "meister" && route.mode === "new")) render({ live: true });
  });
}

function navigate(hash) {
  if (window.location.hash === hash) render();
  else window.location.hash = hash;
}

function parseHash() {
  const hash = window.location.hash || "#/dashboard";
  const parts = hash.replace(/^#\//, "").split("/");
  if (parts[0] === "" || parts[0] === "dashboard") return { name: "dashboard", key: "dashboard" };
  if (parts[0] === "login") return { name: "login", key: "login" };
  if (parts[0] === "activity") return { name: "activity", key: "activity" };
  if (parts[0] === "followups") return { name: "followups", key: "followups" };
  if (parts[0] === "notifications") return { name: "notifications", key: "notifications" };
  if (parts[0] === "analytics" || parts[0] === "insights") return { name: "analytics", key: "analytics" };
  if (parts[0] === "account") return { name: "account", key: "account" };
  if (parts[0] === "meister" && parts[1] === "new") return { name: "meister", mode: "new", key: "meister:new" };
  if (parts[0] === "meister" && parts[1]) return { name: "meister", mode: "view", id: parts[1], key: `meister:${parts[1]}` };
  return { name: "dashboard", key: "dashboard" };
}

// ============================================================
// RENDER
// ============================================================
let renderSeq = 0;
let lastPaintedKey = null;

async function render() {
  const seq = ++renderSeq;
  const route = parseHash();

  if (route.key !== draftsRouteKey) {
    drafts = {};
    draftsRouteKey = route.key;
    if (route.name === "meister") uiState = freshUiState(route.mode === "new" ? "profile" : "activity");
  } else {
    captureDrafts();
  }

  const session = await getSession();
  if (seq !== renderSeq) return;

  if (!session && route.name !== "login") return void (window.location.hash = "#/login");
  if (session && route.name === "login") return void (window.location.hash = "#/dashboard");
  if (route.name === "login") return renderLogin();

  if (route.key !== lastPaintedKey || !app.querySelector(".shell")) {
    renderShell(route, (c) => (c.innerHTML = `<div class="loading">Loading…</div>`));
    lastPaintedKey = route.key;
  }

  if (currentProfile) {
    [myDueCount, myUnread, categories] = await Promise.all([
      countMyDueFollowUps(currentProfile.id),
      listUnreadNotifications(currentProfile.id),
      listCategories().catch(() => categories),
    ]);
  }
  if (seq !== renderSeq) return;

  if (route.name === "dashboard") return renderDashboard(route, seq);
  if (route.name === "activity") return renderActivity(route, seq);
  if (route.name === "followups") return renderFollowUpsPage(route, seq);
  if (route.name === "notifications") return renderNotificationsPage(route, seq);
  if (route.name === "analytics") return renderAnalyticsPage(route, seq);
  if (route.name === "account") return renderAccount(route, seq);
  if (route.name === "meister") return renderMeister(route, seq);
}

function renderShell(route, contentFn) {
  if (route.key === draftsRouteKey) captureDrafts();
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a href="#/dashboard" class="brand"><span class="brand-dot"></span><span>GR GT Concierge CRM</span></a>
        <nav class="nav">
          <a href="#/dashboard" class="${route.name === "dashboard" || route.name === "meister" ? "active" : ""}">Meisters</a>
          <a href="#/activity" class="${route.name === "activity" ? "active" : ""}">Activity Log</a>
          <a href="#/followups" class="${route.name === "followups" ? "active" : ""}">Follow-Ups${myDueCount ? `<span class="nav-badge">${myDueCount}</span>` : ""}</a>
          <a href="#/analytics" class="${route.name === "analytics" ? "active" : ""}">Analytics</a>
        </nav>
        <div class="user-area">
          <a href="#/notifications" class="bell ${route.name === "notifications" ? "active" : ""}" title="Notifications">${I.bell}${myUnread.length ? `<span class="bell-count">${myUnread.length > 99 ? "99+" : myUnread.length}</span>` : ""}</a>
          <a href="#/account" class="user-chip ${route.name === "account" ? "active" : ""}" title="Account settings">
            <span class="user-avatar">${initials(currentProfile?.full_name)}</span>
            <span class="user-name">${escapeHtml(currentProfile?.full_name || "")}</span>
            ${currentProfile?.is_admin ? `<span class="admin-tag">Admin</span>` : ""}
          </a>
          <button id="logout-btn" class="btn btn-ghost">Log Out</button>
        </div>
      </header>
      <main id="main-content" class="main-content"></main>
    </div>
  `;
  document.getElementById("logout-btn").addEventListener("click", () => signOut());
  contentFn(document.getElementById("main-content"));
}

function paint(route, seq, fn) {
  if (seq !== renderSeq) return false;
  let container;
  renderShell(route, (c) => (container = c));
  fn(container);
  return true;
}

// ============================================================
// LOGIN
// ============================================================
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <form id="login-form" class="login-card">
        <div class="brand brand-lg"><span class="brand-dot"></span><span>GR GT Concierge CRM</span></div>
        <p class="login-sub">Sign in with the account your team lead set up for you.</p>
        <label>Email</label>
        <input type="email" id="login-email" required autocomplete="username" />
        <label>Password</label>
        <input type="password" id="login-password" required autocomplete="current-password" />
        <div id="login-error" class="error-text"></div>
        <button type="submit" class="btn btn-primary btn-full">Sign In</button>
      </form>
    </div>
  `;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    btn.disabled = true;
    const { error } = await signIn(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
    if (error) {
      errorEl.textContent = error.message;
      btn.disabled = false;
    }
  });
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard(route, seq) {
  let meisters, rollups;
  try {
    [meisters, rollups] = await Promise.all([listMeisters(), listMeisterRollups(currentProfile.id)]);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load meisters: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  meisters.forEach((m) => Object.assign(m, rollups[m.id] || { last_contact: null, interaction_count: 0, guest_count: 0, my_follow_up: null }));

  const counts = { total: meisters.length, overdue: 0 };
  STATUSES.forEach((s) => (counts[s] = 0));
  meisters.forEach((m) => {
    counts[m.status] = (counts[m.status] || 0) + 1;
    if (m.my_follow_up && followUpState(m.my_follow_up.due_at) === "overdue") counts.overdue++;
  });

  container.innerHTML = `
    <div class="page-header">
      <h1>Meisters</h1>
      <div class="page-actions">
        <button id="export-btn" class="btn btn-ghost">${I.download} Export to Excel</button>
        <button id="new-meister-btn" class="btn btn-primary">${I.plus} Add Meister</button>
      </div>
    </div>

    <div class="kpi-strip">
      <button class="kpi ${dashState.status === "" ? "active" : ""}" data-status=""><span class="kpi-num">${counts.total}</span><span class="kpi-label">Total</span></button>
      ${STATUSES.map(
        (s) => `<button class="kpi ${dashState.status === s ? "active" : ""}" data-status="${s}"><span class="kpi-num st-${slug(s)}">${counts[s]}</span><span class="kpi-label">${s}</span></button>`
      ).join("")}
      <button class="kpi kpi-alert ${dashState.status === "__overdue" ? "active" : ""}" data-status="__overdue"><span class="kpi-num">${counts.overdue}</span><span class="kpi-label">My overdue</span></button>
    </div>

    <div class="filters">
      <div class="search-box">${I.search}<input id="search-input" type="text" placeholder="Search name, title, dealership, city, phone, email…" value="${escapeAttr(dashState.q)}" /></div>
      <select id="status-filter">
        <option value="">All Statuses</option>
        ${STATUSES.map((s) => `<option ${dashState.status === s ? "selected" : ""}>${s}</option>`).join("")}
        <option value="__overdue" ${dashState.status === "__overdue" ? "selected" : ""}>My overdue follow-ups</option>
      </select>
      <select id="concierge-filter">
        <option value="">All Concierges</option>
        ${CONCIERGES.map((c) => `<option ${dashState.concierge === c ? "selected" : ""}>${c}</option>`).join("")}
        <option value="__none" ${dashState.concierge === "__none" ? "selected" : ""}>Unassigned</option>
      </select>
    </div>

    <div class="table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            ${th("name", "Name")}
            ${th("dealership", "Dealership")}
            ${th("concierge", "Concierge")}
            ${th("status", "Status")}
            ${th("follow_up", "My Follow-Up")}
            ${th("last_contact", "Last Contact")}
            ${th("updated", "Updated")}
          </tr>
        </thead>
        <tbody id="meister-rows"></tbody>
      </table>
      <div id="empty-state" class="empty-state" style="display:none">No meisters match your filters.</div>
    </div>
  `;

  document.getElementById("new-meister-btn").addEventListener("click", () => navigate("#/meister/new"));
  document.getElementById("export-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await exportToExcel(currentProfile.id);
      toast("Export downloaded");
    } catch (err) {
      toast("Export failed: " + err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");
  const conciergeFilter = document.getElementById("concierge-filter");
  const draw = () => drawMeisterRows(meisters);

  searchInput.addEventListener("input", () => { dashState.q = searchInput.value; draw(); });
  statusFilter.addEventListener("change", () => { dashState.status = statusFilter.value; syncKpis(); draw(); });
  conciergeFilter.addEventListener("change", () => { dashState.concierge = conciergeFilter.value; draw(); });
  container.querySelectorAll(".kpi").forEach((k) =>
    k.addEventListener("click", () => {
      dashState.status = k.dataset.status;
      statusFilter.value = dashState.status;
      syncKpis();
      draw();
    })
  );
  container.querySelectorAll("th[data-sort]").forEach((h) =>
    h.addEventListener("click", () => {
      const key = h.dataset.sort;
      if (dashState.sort === key) dashState.dir = dashState.dir === "asc" ? "desc" : "asc";
      else {
        dashState.sort = key;
        dashState.dir = ["name", "dealership", "concierge", "status", "follow_up"].includes(key) ? "asc" : "desc";
      }
      container.querySelectorAll("th[data-sort]").forEach((x) => (x.innerHTML = thInner(x.dataset.sort, x.dataset.label)));
      draw();
    })
  );

  function syncKpis() {
    container.querySelectorAll(".kpi").forEach((k) => k.classList.toggle("active", k.dataset.status === dashState.status));
  }
  draw();
}

function th(key, label) {
  return `<th data-sort="${key}" data-label="${label}" class="sortable">${thInner(key, label)}</th>`;
}
function thInner(key, label) {
  const active = dashState.sort === key;
  return `<span>${label}</span><span class="sort-ic ${active ? "on" : ""}">${active ? (dashState.dir === "asc" ? I.up : I.down) : I.sort}</span>`;
}

function drawMeisterRows(meisters) {
  const q = dashState.q.toLowerCase().trim();
  const filtered = meisters.filter((m) => {
    const matchesQuery =
      !q ||
      [m.name, m.job_title, m.dealership, m.city, m.phone, m.email, m.concierge].some((f) => (f || "").toLowerCase().includes(q));
    const matchesStatus =
      !dashState.status ||
      (dashState.status === "__overdue"
        ? m.my_follow_up && followUpState(m.my_follow_up.due_at) === "overdue"
        : m.status === dashState.status);
    const matchesConcierge =
      !dashState.concierge || (dashState.concierge === "__none" ? !m.concierge : m.concierge === dashState.concierge);
    return matchesQuery && matchesStatus && matchesConcierge;
  });

  const dir = dashState.dir === "asc" ? 1 : -1;
  const keyFn = {
    name: (m) => (m.name || "").toLowerCase(),
    dealership: (m) => (m.dealership || "").toLowerCase(),
    concierge: (m) => (m.concierge || "").toLowerCase(),
    status: (m) => STATUSES.indexOf(m.status),
    follow_up: (m) => m.my_follow_up?.due_at || "",
    last_contact: (m) => m.last_contact || "",
    updated: (m) => m.updated_at || "",
  }[dashState.sort];
  filtered.sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    if (ka === "" && kb !== "") return 1;
    if (kb === "" && ka !== "") return -1;
    return ka < kb ? -dir : ka > kb ? dir : 0;
  });

  const tbody = document.getElementById("meister-rows");
  const emptyState = document.getElementById("empty-state");
  emptyState.style.display = filtered.length ? "none" : "block";
  const unreadMeisters = new Set(myUnread.map((n) => n.meister_id));
  tbody.innerHTML = filtered
    .map(
      (m) => `
      <tr class="clickable-row" data-id="${m.id}">
        <td class="cell-name">
          <div>${unreadMeisters.has(m.id) ? `<span class="unread-dot" title="New activity"></span>` : ""}${escapeHtml(m.name)}</div>
          <div class="muted cell-sub">${escapeHtml(m.job_title || formatPhone(m.phone) || m.email || "")}</div>
        </td>
        <td>${escapeHtml(m.dealership || "—")}${m.city ? `<div class="muted cell-sub">${escapeHtml([m.city, m.state].filter(Boolean).join(", "))}</div>` : ""}</td>
        <td>${escapeHtml(m.concierge || "—")}</td>
        <td><span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span></td>
        <td>${m.my_follow_up ? followUpChip(m.my_follow_up.due_at) + `<div class="muted cell-sub">${escapeHtml(m.my_follow_up.title)}</div>` : `<span class="muted">—</span>`}</td>
        <td>${m.last_contact ? `<div>${relativeTime(m.last_contact)}</div><div class="muted cell-sub">${m.interaction_count} logged</div>` : `<span class="muted">Never</span>`}</td>
        <td class="muted">${relativeTime(m.updated_at)}</td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".clickable-row").forEach((row) =>
    row.addEventListener("click", () => navigate(`#/meister/${row.dataset.id}`))
  );
}

// ============================================================
// ACTIVITY LOG (team-wide)
// ============================================================
async function renderActivity(route, seq) {
  let notes, doneFus, commentCounts;
  try {
    [notes, doneFus, commentCounts] = await Promise.all([listRecentActivity(300), listRecentDoneFollowUps(300), listCommentCounts()]);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load activity: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  // One feed: logged conversations + completed follow-ups, newest first.
  const activity = [
    ...notes.map((n) => ({ type: "note", time: n.occurred_at, person: n.created_by_name, method: n.method, meister_id: n.meister_id, meisterName: n.meisters?.name, note: n.note, id: n.id, category_id: n.category_id })),
    ...doneFus.map((f) => ({ type: "fu", time: f.done_at, person: f.user_name, method: "__fu", meister_id: f.meister_id, meisterName: f.meisters?.name, title: f.title, due_at: f.due_at, id: f.id })),
  ].sort((a, b) => (a.time < b.time ? 1 : -1));

  const people = [...new Set(activity.map((a) => a.person).filter(Boolean))].sort();

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Activity Log</h1><p class="muted">Every conversation the team has logged, most recent first.</p></div>
    </div>
    <div class="filters">
      <div class="search-box">${I.search}<input id="act-search" type="text" placeholder="Search notes or meister names…" value="${escapeAttr(actState.q)}" /></div>
      <select id="act-person">
        <option value="">Everyone</option>
        ${people.map((p) => `<option ${actState.person === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
      </select>
      <select id="act-category">
        <option value="">All question types</option>
        ${categories.filter((c) => c.active).map((c) => `<option value="${c.id}" ${actState.category === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        <option value="__none" ${actState.category === "__none" ? "selected" : ""}>No type selected</option>
      </select>
    </div>
    <div class="filter-chips" id="act-chips" style="margin-bottom:16px">
      <button class="chip ${!actState.method ? "active" : ""}" data-method="">All</button>
      ${METHODS.map((m) => `<button class="chip ${actState.method === m ? "active" : ""}" data-method="${m}">${METHOD_ICON[m]} ${m}</button>`).join("")}
      <button class="chip ${actState.method === "__fu" ? "active" : ""}" data-method="__fu">${I.check} Follow-ups done</button>
    </div>
    <div id="act-feed"></div>
  `;

  const draw = () => {
    const q = actState.q.toLowerCase().trim();
    const list = activity.filter(
      (a) =>
        (!actState.method || a.method === actState.method) &&
        (!actState.person || a.person === actState.person) &&
        (!actState.category || (a.type === "note" && (actState.category === "__none" ? !a.category_id : a.category_id === actState.category))) &&
        (!q || (a.note || a.title || "").toLowerCase().includes(q) || (a.meisterName || "").toLowerCase().includes(q))
    );
    const feed = document.getElementById("act-feed");
    if (!list.length) {
      feed.innerHTML = `<div class="empty-state">${activity.length ? "Nothing matches those filters." : "No activity logged yet. Notes your team adds will show up here."}</div>`;
      return;
    }
    feed.innerHTML = groupBy(list, (a) => dayLabel(a.time))
      .map(
        ([label, items]) => `
        <div class="group-label">${escapeHtml(label)}</div>
        <div class="activity-feed">
          ${items
            .map((a) => {
              if (a.type === "fu") {
                return `
            <div class="activity-item">
              <span class="method-badge method-followup">${I.check} Follow-up</span>
              <div class="activity-body">
                <div class="activity-top">
                  <a href="#/meister/${a.meister_id}" class="activity-meister">${escapeHtml(a.meisterName || "Unknown Meister")}</a>
                  <span class="muted">completed by ${escapeHtml(a.person || "someone")}</span>
                  <span class="muted activity-time">${fmtTime(a.time)}</span>
                </div>
                <div class="activity-note">${escapeHtml(a.title)} <span class="muted">· was due ${fmtDateTime(a.due_at)}</span></div>
              </div>
            </div>`;
              }
              const n = commentCounts[a.id] || 0;
              const cat = catById(a.category_id);
              return `
            <div class="activity-item">
              <span class="method-badge method-${slug(a.method)}">${METHOD_ICON[a.method] || ""} ${escapeHtml(a.method)}</span>
              <div class="activity-body">
                <div class="activity-top">
                  <a href="#/meister/${a.meister_id}" class="activity-meister">${escapeHtml(a.meisterName || "Unknown Meister")}</a>
                  ${cat ? `<span class="cat-chip has static">${I.tag} ${escapeHtml(cat.name)}</span>` : ""}
                  <span class="muted">by ${escapeHtml(a.person || "someone")}</span>
                  ${n ? `<a href="#/meister/${a.meister_id}" class="comment-count">${I.reply} ${n} ${n === 1 ? "comment" : "comments"}</a>` : ""}
                  <span class="muted activity-time">${fmtTime(a.time)}</span>
                </div>
                <div class="activity-note">${escapeHtml(a.note)}</div>
              </div>
            </div>`;
            })
            .join("")}
        </div>`
      )
      .join("");
  };

  document.getElementById("act-search").addEventListener("input", (e) => { actState.q = e.target.value; draw(); });
  document.getElementById("act-person").addEventListener("change", (e) => { actState.person = e.target.value; draw(); });
  document.getElementById("act-category").addEventListener("change", (e) => { actState.category = e.target.value; draw(); });
  container.querySelectorAll("#act-chips .chip").forEach((c) =>
    c.addEventListener("click", () => {
      actState.method = c.dataset.method;
      container.querySelectorAll("#act-chips .chip").forEach((x) => x.classList.toggle("active", x === c));
      draw();
    })
  );
  draw();
}

// ============================================================
// FOLLOW-UPS PAGE (mine only)
// ============================================================
async function renderFollowUpsPage(route, seq) {
  let all;
  try {
    all = await listMyFollowUps(currentProfile.id);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load follow-ups: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const pending = all.filter((f) => !f.done_at);
  const done = all.filter((f) => f.done_at).sort((a, b) => (a.done_at < b.done_at ? 1 : -1)).slice(0, 50);
  const overdue = pending.filter((f) => followUpState(f.due_at) === "overdue");

  container.innerHTML = `
    <div class="page-header">
      <div><h1>My Follow-Ups</h1><p class="muted">Only the follow-ups you've set, across every Meister.${overdue.length ? ` <span class="fu-overdue">${overdue.length} overdue.</span>` : ""}</p></div>
      <div class="page-actions">
        <button id="toggle-done-btn" class="btn btn-ghost">${fuPageState.showDone ? "Hide completed" : `Show completed (${done.length})`}</button>
      </div>
    </div>

    ${
      pending.length
        ? groupBy(pending, (f) => fuGroupLabel(f.due_at))
            .map(
              ([label, items]) => `
          <div class="group-label ${label === "Overdue" ? "fu-overdue" : ""}">${escapeHtml(label)}</div>
          <div class="fu-list">${items.map((f) => (fuPageState.editingId === f.id ? fuFormHtml(f, f.meisters?.name) : fuRowHtml(f, f.meisters?.name, true))).join("")}</div>`
            )
            .join("")
        : `<div class="empty-state">Nothing pending. Set a follow-up when you log an activity on a Meister, or from their Activity tab.</div>`
    }

    ${
      fuPageState.showDone && done.length
        ? `<div class="group-label" style="margin-top:28px">Completed</div>
           <div class="fu-list">${done.map((f) => fuRowHtml(f, f.meisters?.name, true)).join("")}</div>`
        : ""
    }
  `;

  document.getElementById("toggle-done-btn").addEventListener("click", () => {
    fuPageState.showDone = !fuPageState.showDone;
    render();
  });
  wireFollowUpControls(container, {
    onEdit: (id) => { fuPageState.editingId = id; render(); },
    onCancel: () => { fuPageState.editingId = null; render(); },
    afterSave: () => { fuPageState.editingId = null; },
  });
}

function fuGroupLabel(iso) {
  const s = followUpState(iso);
  if (s === "overdue") return "Overdue";
  if (s === "today") return "Today";
  const d = new Date(iso);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  const week = new Date(); week.setDate(week.getDate() + 7);
  if (d < week) return "This week";
  return "Later";
}

// ---------- follow-up rows/forms (shared by Follow-Ups page and Meister page) ----------
function canManageFu(f) {
  return f.user_id === currentProfile.id || isAdmin();
}

function fuRowHtml(f, meisterName, showMeister) {
  const st = f.done_at ? "done" : followUpState(f.due_at);
  const mine = canManageFu(f);
  return `
    <div class="fu-row ${f.done_at ? "is-done" : ""}" data-id="${f.id}">
      ${mine ? `<button class="fu-check ${f.done_at ? "on" : ""}" data-fu-toggle="${f.id}" data-done="${f.done_at ? "1" : "0"}" title="${f.done_at ? "Mark not done" : "Mark done"}">${f.done_at ? I.check : ""}</button>` : `<span class="fu-check static"></span>`}
      <div class="fu-body">
        <div class="fu-title">${escapeHtml(f.title)}</div>
        <div class="fu-meta">
          <span class="fu-chip fu-${st}">${I.calendar} ${f.done_at ? "Done " + fmtDateTime(f.done_at) : fmtDateTime(f.due_at)}</span>
          ${showMeister && meisterName ? `<a href="#/meister/${f.meister_id}" class="fu-meister">${escapeHtml(meisterName)}</a>` : ""}
          ${!showMeister || f.user_id !== currentProfile.id ? `<span class="muted">${escapeHtml(f.user_name || "")}</span>` : ""}
        </div>
      </div>
      <div class="fu-actions">
        ${!f.done_at ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${escapeAttr(outlookLink(f, meisterName))}" title="Open a pre-filled Outlook event">${I.calendarPlus} Outlook</a>
        <a class="icon-btn" download="${escapeAttr(slug(f.title) || "follow-up")}.ics" href="${escapeAttr(icsLink(f, meisterName))}" title="Download .ics for desktop Outlook">${I.download}</a>` : ""}
        ${mine ? `<button class="icon-btn" data-fu-edit="${f.id}" title="Edit">${I.edit}</button>
        <button class="icon-btn danger" data-fu-delete="${f.id}" title="Delete">${I.trash}</button>` : ""}
      </div>
    </div>`;
}

function fuFormHtml(existing, meisterName) {
  const p = existing ? `fue-${existing.id}-` : "fu-";
  const title = dv(`${p}title`, existing ? existing.title : "");
  const when = dv(`${p}when`, toLocalInput(existing ? existing.due_at : defaultFollowUpTime()));
  return `
    <form class="composer fu-form" data-prefix="${p}" data-edit-id="${existing ? existing.id : ""}">
      <div class="fu-form-grid">
        <input id="${p}title" data-draft placeholder="Follow-up title, e.g. Call about allocation" value="${escapeAttr(title)}" required />
        <input id="${p}when" data-draft type="datetime-local" value="${escapeAttr(when)}" required />
      </div>
      ${meisterName ? `<div class="muted" style="margin-top:6px">For ${escapeHtml(meisterName)}</div>` : ""}
      <div class="composer-actions">
        <button type="button" class="btn cancel-fu-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">${existing ? "Save changes" : "Set follow-up"}</button>
      </div>
    </form>`;
}

function wireFollowUpControls(container, { onEdit, onCancel, afterSave, meisterId }) {
  container.querySelectorAll("[data-fu-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const wasDone = b.dataset.done === "1";
      try {
        await updateFollowUp(b.dataset.fuToggle, { done_at: wasDone ? null : new Date().toISOString() });
        toast(wasDone ? "Marked not done" : "Follow-up done");
        render();
      } catch (err) {
        toast("Couldn't update: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll("[data-fu-edit]").forEach((b) => b.addEventListener("click", () => onEdit(b.dataset.fuEdit)));
  container.querySelectorAll("[data-fu-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this follow-up?")) return;
      try {
        await deleteFollowUp(b.dataset.fuDelete);
        toast("Follow-up deleted");
        render();
      } catch (err) {
        toast("Couldn't delete: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll(".fu-form").forEach((form) => {
    const prefix = form.dataset.prefix;
    const editId = form.dataset.editId;
    form.querySelector(".cancel-fu-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      onCancel(editId);
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById(`${prefix}title`).value.trim();
      const due_at = fromLocalInput(document.getElementById(`${prefix}when`).value);
      if (!title || !due_at) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (editId) {
          await updateFollowUp(editId, { title, due_at });
          toast("Follow-up updated");
        } else {
          await addFollowUp({ meister_id: meisterId, title, due_at }, currentProfile.full_name, currentProfile.id);
          toast("Follow-up set");
        }
        clearDrafts(prefix);
        afterSave(editId);
        render();
      } catch (err) {
        toast("Couldn't save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });
}

// ---------- calendar links ----------
function crmLink(meisterId) {
  return `${location.origin}${location.pathname}#/meister/${meisterId}`;
}
function outlookLink(f, meisterName) {
  const start = new Date(f.due_at);
  const end = new Date(start.getTime() + 30 * 60000);
  const u = new URL("https://outlook.office.com/calendar/0/deeplink/compose");
  u.searchParams.set("subject", `${f.title}${meisterName ? " — " + meisterName : ""}`);
  u.searchParams.set("startdt", start.toISOString());
  u.searchParams.set("enddt", end.toISOString());
  u.searchParams.set("body", `GR GT CRM follow-up${meisterName ? " for " + meisterName : ""}\n${crmLink(f.meister_id)}`);
  u.searchParams.set("path", "/calendar/action/compose");
  u.searchParams.set("rru", "addevent");
  return u.toString();
}
function icsLink(f, meisterName) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(f.due_at);
  const end = new Date(start.getTime() + 30 * 60000);
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GR GT Concierge CRM//EN",
    "BEGIN:VEVENT",
    `UID:${f.id}@gr-gt-crm`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(f.title + (meisterName ? " — " + meisterName : ""))}`,
    `DESCRIPTION:${esc("GR GT CRM follow-up" + (meisterName ? " for " + meisterName : "") + "\n" + crmLink(f.meister_id))}`,
    `URL:${crmLink(f.meister_id)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(f.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
}
function defaultFollowUpTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

// ============================================================
// QUESTION CATEGORIES (shared helpers)
// ============================================================
function wireCategorySelects(container) {
  container.querySelectorAll(".cat-select").forEach((sel) =>
    sel.addEventListener("change", async () => {
      const id = sel.dataset.note;
      const val = sel.value || null;
      sel.disabled = true;
      try {
        await setInteractionCategory(id, val);
        toast(val ? `Type set: ${catById(val)?.name || ""}` : "Type cleared");
        render();
      } catch (err) {
        toast("Couldn't update type: " + err.message, "error");
        sel.disabled = false;
      }
    })
  );
}

// ============================================================
// ANALYTICS DASHBOARD
// ============================================================
const METHOD_COLOR = { Phone: "#2d6cdf", Text: "#7a3de0", Email: "#e0263f", "In Person": "#1f9d5c", Other: "#55555d" };
const STATUS_COLOR = { New: "#9a9aa2", Contacted: "#f5a623", Engaged: "#f5764a", Sold: "#3ddc84", "Not Interested": "#6b6b73" };

function anaRange() {
  const now = new Date();
  const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  let from = null, to = null;
  switch (anaState.range) {
    case "7d": from = startOf(new Date(now - 6 * 86400000)); break;
    case "30d": from = startOf(new Date(now - 29 * 86400000)); break;
    case "90d": from = startOf(new Date(now - 89 * 86400000)); break;
    case "month": from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "lastmonth": from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "ytd": from = new Date(now.getFullYear(), 0, 1); break;
    case "custom":
      if (anaState.from) from = parseDateOnly(anaState.from);
      if (anaState.to) { to = parseDateOnly(anaState.to); to.setDate(to.getDate() + 1); }
      break;
  }
  return { from, to };
}

async function renderAnalyticsPage(route, seq) {
  let d;
  try {
    d = await fetchAnalyticsData();
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load analytics: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const { from, to } = anaRange();
  const inWindow = (iso) => { const t = new Date(iso); return (!from || t >= from) && (!to || t < to); };
  const concOf = (m) => (m?.concierge || "");
  const conciergeOk = (c) => !anaState.concierge || c === anaState.concierge;

  // Team map: who logged it → which concierge name (falls back to display name)
  const loggerName = (i) => {
    const p = d.team.find((t) => t.id === i.created_by);
    return p?.concierge || p?.full_name || i.created_by_name || "Unknown";
  };

  const ints = d.interactions.filter((i) => inWindow(i.occurred_at) && conciergeOk(concOf(i.meisters)));
  const meisters = d.meisters.filter((m) => conciergeOk(m.concierge));
  const guests = d.guests.filter((g) => g.purchase_date && inWindow(g.purchase_date + "T12:00:00") && conciergeOk(concOf(g.meisters)));
  const fus = d.followUps.filter((f) => conciergeOk(concOf(f.meisters)));

  // ---- KPIs ----
  const contactedIds = new Set(ints.map((i) => i.meister_id));
  const weekEnd = endOfWeek(new Date());
  const dueThisWeek = fus.filter((f) => new Date(f.due_at) <= weekEnd);

  // ---- time series ----
  const spanDays = from ? Math.max(1, Math.round(((to || new Date()) - from) / 86400000)) : dataSpanDays(ints.map((i) => i.occurred_at));
  const bucket = spanDays <= 31 ? "day" : spanDays <= 182 ? "week" : "month";
  const series = timeSeries(ints.map((i) => i.occurred_at), bucket, from, to);

  // ---- breakdowns ----
  const byMethod = METHODS.map((m) => ({ key: m, label: m, value: ints.filter((i) => i.method === m).length, color: METHOD_COLOR[m] })).filter((x) => x.value);
  const conciergeNames = [...new Set([...CONCIERGES, ...ints.map(loggerName)])];
  const byConcierge = conciergeNames.map((c) => {
    const mine = ints.filter((i) => loggerName(i) === c);
    return { key: c, label: c, value: mine.length, parts: METHODS.map((m) => ({ m, n: mine.filter((i) => i.method === m).length })) };
  }).filter((x) => x.value || CONCIERGES.includes(x.key));
  const byCat = categories.map((c) => ({ key: c.id, label: c.name, value: ints.filter((i) => i.category_id === c.id).length, active: c.active })).filter((x) => x.value || x.active).sort((a, b) => b.value - a.value);
  const untyped = ints.filter((i) => !i.category_id || !catById(i.category_id)).length;
  const byStatus = STATUSES.map((s) => ({ key: s, label: s, value: meisters.filter((m) => m.status === s).length, color: STATUS_COLOR[s] }));
  const salesSeries = monthlySeries(d.guests.filter((g) => g.purchase_date && conciergeOk(concOf(g.meisters))).map((g) => g.purchase_date + "T12:00:00"), 12);
  const engaged = groupBy(ints, (i) => i.meister_id)
    .map(([id, items]) => ({ id, name: items[0].meisters?.name || "Unknown", dealership: items[0].meisters?.dealership, status: items[0].meisters?.status, n: items.length, last: items[0].occurred_at }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  // ---- follow-up counters ----
  const now = new Date();
  const buckets = [
    { key: "overdue", label: "Overdue", test: (t) => t < now },
    { key: "week", label: "This week", test: (t) => t >= now && t <= endOfWeek(now) },
    { key: "nextweek", label: "Next week", test: (t) => t > endOfWeek(now) && t <= endOfWeek(addDays(endOfWeek(now), 1)) },
    { key: "month", label: "This month", test: (t) => t >= now && t <= endOfMonth(now) },
    { key: "nextmonth", label: "Next month", test: (t) => t > endOfMonth(now) && t <= endOfMonth(addDays(endOfMonth(now), 1)) },
  ].map((b) => ({ ...b, items: fus.filter((f) => b.test(new Date(f.due_at))) }));

  const rangeLabel = { all: "All time", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", month: "This month", lastmonth: "Last month", ytd: "Year to date", custom: "Custom range" }[anaState.range];

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Analytics</h1><p class="muted">${escapeHtml(rangeLabel)}${anaState.concierge ? " · " + escapeHtml(anaState.concierge) + "'s Meisters" : ""}. Click any number, bar, or row to see what's behind it.</p></div>
      <div class="page-actions">
        <button id="ana-export-btn" class="btn btn-ghost">${I.download} Export to Excel</button>
        ${isAdmin() ? `<a href="#/account" class="btn btn-ghost">${I.tag} Manage question types</a>` : ""}
      </div>
    </div>

    <div class="filters">
      <select id="ana-range">
        ${[["7d","Last 7 days"],["30d","Last 30 days"],["90d","Last 90 days"],["month","This month"],["lastmonth","Last month"],["ytd","Year to date"],["all","All time"],["custom","Custom range…"]]
          .map(([v, l]) => `<option value="${v}" ${anaState.range === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      ${anaState.range === "custom" ? `<input id="ana-from" type="date" value="${escapeAttr(anaState.from)}" /><input id="ana-to" type="date" value="${escapeAttr(anaState.to)}" />` : ""}
      <select id="ana-concierge">
        <option value="">All concierges</option>
        ${CONCIERGES.map((c) => `<option ${anaState.concierge === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
    </div>

    <div class="kpi-strip kpi-strip-4">
      <button class="kpi drill" data-drill="ints"><span class="kpi-num">${ints.length}</span><span class="kpi-label">Conversations logged</span></button>
      <button class="kpi drill" data-drill="contacted"><span class="kpi-num">${contactedIds.size}</span><span class="kpi-label">Meisters contacted <span class="muted">of ${meisters.length}</span></span></button>
      <button class="kpi drill" data-drill="sales"><span class="kpi-num st-sold">${guests.length}</span><span class="kpi-label">Vehicles sold (guests)</span></button>
      <button class="kpi drill" data-drill="fu:week"><span class="kpi-num ${dueThisWeek.some((f) => new Date(f.due_at) < now) ? "st-not-interested" : ""}">${dueThisWeek.length}</span><span class="kpi-label">Follow-ups due by end of week</span></button>
    </div>

    <div class="ana-grid">
      <div class="card ana-span-8">
        <div class="card-head"><h3>${I.chart} Activity over time</h3><span class="muted">${bucket === "day" ? "Daily" : bucket === "week" ? "Weekly" : "Monthly"} · ${ints.length} total</span></div>
        ${ints.length ? barChartSvg(series, { drillPrefix: "bucket" }) : `<div class="empty-state">No activity in this range.</div>`}
      </div>
      <div class="card ana-span-4">
        <div class="card-head"><h3>Interactions by type</h3></div>
        ${byMethod.length ? donutSvg(byMethod, "method") : `<div class="empty-state">Nothing yet.</div>`}
      </div>

      <div class="card ana-span-4">
        <div class="card-head"><h3>Activity by concierge</h3><span class="muted">logged by</span></div>
        <div class="stack-list">
          ${byConcierge.map((c) => `
            <button class="stack-row drill" data-drill="logger:${escapeAttr(c.key)}">
              <span class="stack-label">${escapeHtml(c.label)}</span>
              <span class="stack-track">${c.parts.filter((p) => p.n).map((p) => `<span class="stack-seg" style="width:${(p.n / Math.max(1, c.value)) * 100}%;background:${METHOD_COLOR[p.m]}" title="${p.m}: ${p.n}"></span>`).join("")}</span>
              <span class="bar-val">${c.value}</span>
            </button>`).join("") || `<div class="empty-state">Nothing yet.</div>`}
        </div>
        <div class="legend">${METHODS.map((m) => `<span class="legend-item"><span class="legend-dot" style="background:${METHOD_COLOR[m]}"></span>${m}</span>`).join("")}</div>
      </div>

      <div class="card ana-span-4">
        <div class="card-head"><h3>${I.tag} Question types</h3><span class="muted">${ints.length - untyped} typed</span></div>
        <div class="bar-chart">
          ${byCat.map((c) => `
            <button class="bar-row drill" data-drill="cat:${c.key}">
              <span class="bar-label">${escapeHtml(c.label)}${c.active ? "" : ` <span class="muted">(retired)</span>`}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${(c.value / Math.max(1, ...byCat.map((x) => x.value), untyped)) * 100}%"></span></span>
              <span class="bar-val">${c.value}</span>
            </button>`).join("")}
          <button class="bar-row bar-none drill" data-drill="cat:__none"><span class="bar-label">No type selected</span><span class="bar-track"><span class="bar-fill" style="width:${(untyped / Math.max(1, ...byCat.map((x) => x.value), untyped)) * 100}%"></span></span><span class="bar-val">${untyped}</span></button>
        </div>
      </div>

      <div class="card ana-span-4">
        <div class="card-head"><h3>Meisters by status</h3><span class="muted">${meisters.length} total</span></div>
        <div class="bar-chart">
          ${byStatus.map((s) => `
            <button class="bar-row drill" data-drill="status:${escapeAttr(s.key)}">
              <span class="bar-label">${escapeHtml(s.label)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${(s.value / Math.max(1, ...byStatus.map((x) => x.value))) * 100}%;background:${s.color}"></span></span>
              <span class="bar-val">${s.value}</span>
            </button>`).join("")}
        </div>
      </div>

      <div class="card ana-span-6">
        <div class="card-head"><h3>${I.chart} Vehicles sold per month</h3><span class="muted">last 12 months · guest purchases</span></div>
        ${lineChartSvg(salesSeries, { drillPrefix: "salesmonth" })}
      </div>

      <div class="card ana-span-6">
        <div class="card-head"><h3>Most engaged Meisters</h3><span class="muted">by conversations in range</span></div>
        <div class="rank-list">
          ${engaged.map((m, idx) => `
            <button class="rank-row drill" data-drill="meister:${m.id}">
              <span class="rank-num">${idx + 1}</span>
              <span class="rank-body"><span class="rank-name">${escapeHtml(m.name)}</span><span class="muted">${escapeHtml(m.dealership || "")} · last ${relativeTime(m.last)}</span></span>
              <span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status || "")}</span>
              <span class="bar-val">${m.n}</span>
            </button>`).join("") || `<div class="empty-state">No conversations in this range.</div>`}
        </div>
      </div>

      <div class="card ana-span-12">
        <div class="card-head"><h3>${I.bell} Upcoming follow-ups</h3><span class="muted">team-wide, pending</span></div>
        <div class="fu-counters">
          ${buckets.map((b) => `
            <button class="fu-counter drill ${b.key === "overdue" && b.items.length ? "alert" : ""}" data-drill="fu:${b.key}">
              <span class="kpi-num">${b.items.length}</span>
              <span class="kpi-label">${b.label}</span>
              <span class="fu-counter-sub muted">${CONCIERGES.map((c) => `${c} ${b.items.filter((f) => f.user_name && f.user_name.toLowerCase().startsWith(c.toLowerCase())).length}`).join(" · ")}</span>
            </button>`).join("")}
        </div>
      </div>
    </div>
  `;

  // ---- wiring ----
  document.getElementById("ana-range").addEventListener("change", (e) => { anaState.range = e.target.value; anaState.drill = null; render(); });
  document.getElementById("ana-from")?.addEventListener("change", (e) => { anaState.from = e.target.value; render(); });
  document.getElementById("ana-to")?.addEventListener("change", (e) => { anaState.to = e.target.value; render(); });
  document.getElementById("ana-concierge").addEventListener("change", (e) => { anaState.concierge = e.target.value; anaState.drill = null; render(); });
  document.getElementById("ana-export-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await exportToExcel(currentProfile.id); toast("Export downloaded"); }
    catch (err) { toast("Export failed: " + err.message, "error"); }
    finally { btn.disabled = false; }
  });
  container.querySelectorAll(".drill").forEach((el) =>
    el.addEventListener("click", () => { anaState.drill = el.dataset.drill; renderDrawer(); })
  );

  // ---- drawer (drill-down) ----
  const allGuests = d.guests.filter((g) => conciergeOk(concOf(g.meisters)));
  const ctx = { ints, meisters, guests, allGuests, fus, series, salesSeries, buckets, loggerName, byCat };
  function renderDrawer() {
    let root = document.getElementById("drawer-root");
    if (!root) { root = document.createElement("div"); root.id = "drawer-root"; document.body.appendChild(root); }
    if (!anaState.drill) { root.innerHTML = ""; return; }
    const { title, sub, html, csv } = drillContent(anaState.drill, ctx);
    root.innerHTML = `
      <div class="drawer-backdrop"></div>
      <aside class="drawer">
        <div class="drawer-head">
          <div><h2>${title}</h2>${sub ? `<div class="muted">${sub}</div>` : ""}</div>
          <div class="page-actions">
            ${csv ? `<button id="drawer-csv" class="btn btn-ghost btn-sm">${I.download} CSV</button>` : ""}
            <button id="drawer-close" class="icon-btn" title="Close">${I.x}</button>
          </div>
        </div>
        <div class="drawer-body">${html}</div>
      </aside>`;
    const close = () => { anaState.drill = null; root.innerHTML = ""; };
    root.querySelector(".drawer-backdrop").addEventListener("click", close);
    root.querySelector("#drawer-close").addEventListener("click", close);
    root.querySelector("#drawer-csv")?.addEventListener("click", () => downloadCsv(csv.name, csv.rows));
    root.querySelectorAll(".drawer a[href^='#/']").forEach((a) => a.addEventListener("click", close));
    wireCategorySelects(root);
    wireFollowUpControls(root, { onEdit: () => {}, onCancel: () => {}, afterSave: () => {} });
  }
  renderDrawer();
}

// Builds the content for a drill-down key like "cat:<id>", "fu:week", "bucket:3"
function drillContent(key, ctx) {
  const [kind, arg] = key.split(/:(.*)/s);
  const intsList = (rows, title, sub) => ({
    title, sub: sub || `${rows.length} ${rows.length === 1 ? "conversation" : "conversations"}`,
    html: rows.length ? `<div class="notes-list">${rows.map(drillNoteHtml).join("")}</div>` : `<div class="empty-state">Nothing here.</div>`,
    csv: { name: slug(title) + ".csv", rows: rows.map((r) => ({ Meister: r.meisters?.name || "", Method: r.method, "Question Type": catById(r.category_id)?.name || "", "Date/Time": fmtDateTime(r.occurred_at), "Logged By": r.created_by_name || "", Note: r.note })) },
  });
  const meisterList = (rows, title) => ({
    title, sub: `${rows.length} ${rows.length === 1 ? "Meister" : "Meisters"}`,
    html: rows.length ? `<div class="mini-list">${rows.map((m) => `<a href="#/meister/${m.id}" class="mini-row"><span>${escapeHtml(m.name)}<span class="muted"> · ${escapeHtml(m.dealership || "")}</span></span><span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status || "")}</span></a>`).join("")}</div>` : `<div class="empty-state">Nothing here.</div>`,
    csv: { name: slug(title) + ".csv", rows: rows.map((m) => ({ Name: m.name, Dealership: m.dealership || "", Status: m.status, Concierge: m.concierge || "" })) },
  });
  const fuList = (rows, title) => ({
    title, sub: `${rows.length} pending`,
    html: rows.length ? `<div class="fu-list">${rows.map((f) => fuRowHtml(f, f.meisters?.name, true)).join("")}</div>` : `<div class="empty-state">Nothing here.</div>`,
    csv: { name: slug(title) + ".csv", rows: rows.map((f) => ({ Title: f.title, Meister: f.meisters?.name || "", Due: fmtDateTime(f.due_at), Owner: f.user_name || "" })) },
  });

  switch (kind) {
    case "ints": return intsList(ctx.ints, "All conversations in range");
    case "contacted": return meisterList(ctx.meisters.filter((m) => ctx.ints.some((i) => i.meister_id === m.id)), "Meisters contacted in range");
    case "sales": {
      const rows = ctx.guests;
      return {
        title: "Vehicles sold (guest purchases)", sub: `${rows.length} in range`,
        html: rows.length ? `<div class="mini-list">${rows.map((g) => `<a href="#/meister/${g.meister_id}" class="mini-row"><span>${escapeHtml(g.guest_name)}<span class="muted"> · ${escapeHtml(g.vehicle_purchased || "—")} · via ${escapeHtml(g.meisters?.name || "")}</span></span><span class="muted">${fmtDate(g.purchase_date)}</span></a>`).join("")}</div>` : `<div class="empty-state">No purchases in this range.</div>`,
        csv: { name: "vehicles-sold.csv", rows: rows.map((g) => ({ Guest: g.guest_name, Vehicle: g.vehicle_purchased || "", "Purchase Date": g.purchase_date, Meister: g.meisters?.name || "", Notes: g.notes || "" })) },
      };
    }
    case "salesmonth": {
      const pt = ctx.salesSeries[Number(arg)];
      const rows = pt ? ctxGuestsInMonth(ctx, pt) : [];
      return {
        title: `Vehicles sold — ${pt ? pt.label : ""}`, sub: `${rows.length} purchases`,
        html: rows.length ? `<div class="mini-list">${rows.map((g) => `<a href="#/meister/${g.meister_id}" class="mini-row"><span>${escapeHtml(g.guest_name)}<span class="muted"> · ${escapeHtml(g.vehicle_purchased || "—")} · via ${escapeHtml(g.meisters?.name || "")}</span></span><span class="muted">${fmtDate(g.purchase_date)}</span></a>`).join("")}</div>` : `<div class="empty-state">No purchases that month.</div>`,
        csv: { name: "vehicles-sold-month.csv", rows: rows.map((g) => ({ Guest: g.guest_name, Vehicle: g.vehicle_purchased || "", "Purchase Date": g.purchase_date, Meister: g.meisters?.name || "" })) },
      };
    }
    case "bucket": {
      const pt = ctx.series[Number(arg)];
      const rows = pt ? ctx.ints.filter((i) => { const t = new Date(i.occurred_at); return t >= pt.start && t < pt.end; }) : [];
      return intsList(rows, `Activity — ${pt ? pt.label : ""}`);
    }
    case "method": return intsList(ctx.ints.filter((i) => i.method === arg), `${arg} interactions`);
    case "logger": return intsList(ctx.ints.filter((i) => ctx.loggerName(i) === arg), `Logged by ${arg}`);
    case "status": return meisterList(ctx.meisters.filter((m) => m.status === arg), `Meisters — ${arg}`);
    case "meister": {
      const rows = ctx.ints.filter((i) => i.meister_id === arg);
      const m = rows[0]?.meisters;
      return { ...intsList(rows, m?.name || "Meister"), sub: `${rows.length} conversations in range · <a href="#/meister/${arg}">open profile</a>` };
    }
    case "cat": {
      const isNone = arg === "__none";
      const rows = ctx.ints.filter((i) => (isNone ? !i.category_id || !catById(i.category_id) : i.category_id === arg));
      const name = isNone ? "No type selected" : catById(arg)?.name || "Question type";
      return {
        title: name, sub: `${rows.length} ${rows.length === 1 ? "conversation" : "conversations"}`,
        html: insightDetailHtml(name, rows, isNone),
        csv: { name: slug(name) + ".csv", rows: rows.map((r) => ({ Meister: r.meisters?.name || "", Method: r.method, "Date/Time": fmtDateTime(r.occurred_at), "Logged By": r.created_by_name || "", Note: r.note })) },
      };
    }
    case "fu": {
      const b = ctx.buckets.find((x) => x.key === arg);
      return fuList(b ? b.items : [], `Follow-ups — ${b ? b.label : ""}`);
    }
  }
  return { title: "Details", html: `<div class="empty-state">Nothing here.</div>` };
}

function ctxGuestsInMonth(ctx, pt) {
  return ctx.allGuests.filter((g) => g.purchase_date && (() => { const t = new Date(g.purchase_date + "T12:00:00"); return t >= pt.start && t < pt.end; })());
}

function drillNoteHtml(r) {
  return `
    <div class="note-card">
      <div class="note-top">
        <span class="method-badge method-${slug(r.method)}">${METHOD_ICON[r.method] || ""} ${escapeHtml(r.method)}</span>
        ${categorySelectHtml(r)}
        <a href="#/meister/${r.meister_id}" class="activity-meister">${escapeHtml(r.meisters?.name || "Unknown")}</a>
        <span class="muted">${escapeHtml(r.created_by_name || "someone")} &middot; ${fmtDateTime(r.occurred_at)}</span>
      </div>
      <div class="note-text">${escapeHtml(r.note)}</div>
    </div>`;
}

// ---- series builders ----
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function endOfWeek(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); x.setDate(x.getDate() + (6 - x.getDay())); return x; }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function dataSpanDays(isos) {
  if (!isos.length) return 30;
  const min = Math.min(...isos.map((s) => new Date(s).getTime()));
  return Math.max(7, Math.round((Date.now() - min) / 86400000) + 1);
}
function timeSeries(isos, bucket, from, to) {
  const end = to || new Date(Date.now() + 1);
  let start = from;
  if (!start) { start = isos.length ? new Date(Math.min(...isos.map((s) => new Date(s).getTime()))) : addDays(new Date(), -29); }
  start = new Date(start); start.setHours(0, 0, 0, 0);
  if (bucket === "week") start.setDate(start.getDate() - start.getDay());
  if (bucket === "month") start.setDate(1);
  const pts = [];
  let cur = new Date(start);
  let guard = 0;
  while (cur < end && guard++ < 400) {
    const next = new Date(cur);
    if (bucket === "day") next.setDate(next.getDate() + 1);
    else if (bucket === "week") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    const label = bucket === "month" ? cur.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : cur.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
    pts.push({ start: cur, end: next, label, value: 0 });
    cur = next;
  }
  for (const s of isos) {
    const t = new Date(s);
    const p = pts.find((x) => t >= x.start && t < x.end);
    if (p) p.value++;
  }
  return pts;
}
function monthlySeries(isos, months) {
  const pts = [];
  const now = new Date();
  for (let k = months - 1; k >= 0; k--) {
    const s = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
    pts.push({ start: s, end: e, label: s.toLocaleDateString(undefined, { month: "short", year: k >= 12 - now.getMonth() ? "2-digit" : undefined }), value: 0 });
  }
  for (const iso of isos) {
    const t = new Date(iso);
    const p = pts.find((x) => t >= x.start && t < x.end);
    if (p) p.value++;
  }
  return pts;
}

// ---- SVG charts (theme-native, no library) ----
function barChartSvg(pts, { drillPrefix } = {}) {
  const W = 800, H = 260, padL = 34, padR = 10, padT = 18, padB = 34;
  const max = Math.max(1, ...pts.map((p) => p.value));
  const n = pts.length;
  const cw = (W - padL - padR) / n;
  const bw = Math.max(2, Math.min(28, cw * 0.62));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = niceTicks(max, 4);
  const labelEvery = Math.ceil(n / 12);
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Activity over time">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`).join("")}
      ${pts.map((p, i) => {
        const x = padL + i * cw + (cw - bw) / 2;
        return `<g class="bar-g ${drillPrefix ? "drill" : ""}" ${drillPrefix ? `data-drill="${drillPrefix}:${i}"` : ""}>
          <rect x="${padL + i * cw}" y="${padT}" width="${cw}" height="${H - padT - padB}" class="hit"/>
          <rect x="${x}" y="${y(p.value)}" width="${bw}" height="${Math.max(0, H - padB - y(p.value))}" rx="2" class="bar"/>
          ${p.value ? `<text x="${x + bw / 2}" y="${y(p.value) - 5}" class="val" text-anchor="middle">${p.value}</text>` : ""}
          ${i % labelEvery === 0 ? `<text x="${padL + i * cw + cw / 2}" y="${H - padB + 16}" class="tick" text-anchor="middle">${escapeHtml(p.label)}</text>` : ""}
          <title>${escapeHtml(p.label)}: ${p.value}</title>
        </g>`;
      }).join("")}
    </svg>`;
}

function lineChartSvg(pts, { drillPrefix } = {}) {
  const W = 800, H = 240, padL = 34, padR = 16, padT = 18, padB = 34;
  const max = Math.max(1, ...pts.map((p) => p.value));
  const n = pts.length;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = niceTicks(max, 4);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${path} L${x(n - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">
      <defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e0263f" stop-opacity="0.35"/><stop offset="1" stop-color="#e0263f" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`).join("")}
      <path d="${area}" fill="url(#areaGrad)"/>
      <path d="${path}" class="line"/>
      ${pts.map((p, i) => `<g class="pt-g ${drillPrefix ? "drill" : ""}" ${drillPrefix ? `data-drill="${drillPrefix}:${i}"` : ""}>
        <rect x="${x(i) - (W - padL - padR) / Math.max(1, n - 1) / 2}" y="${padT}" width="${(W - padL - padR) / Math.max(1, n - 1)}" height="${H - padT - padB}" class="hit"/>
        <circle cx="${x(i)}" cy="${y(p.value)}" r="4" class="dot"/>
        ${p.value ? `<text x="${x(i)}" y="${y(p.value) - 9}" class="val" text-anchor="middle">${p.value}</text>` : ""}
        <text x="${x(i)}" y="${H - padB + 16}" class="tick" text-anchor="middle">${escapeHtml(p.label)}</text>
        <title>${escapeHtml(p.label)}: ${p.value}</title>
      </g>`).join("")}
    </svg>`;
}

function donutSvg(parts, drillPrefix) {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  const R = 60, r = 38, cx = 80, cy = 80;
  let a0 = -Math.PI / 2;
  const segs = parts.map((p) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const P = (ang, rad) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const d = p.value === total
      ? `M${cx},${cy - R} A${R},${R} 0 1 1 ${cx - 0.01},${cy - R} L${cx - 0.01},${cy - r} A${r},${r} 0 1 0 ${cx},${cy - r} Z`
      : `M${P(a0, R)} A${R},${R} 0 ${large} 1 ${P(a1, R)} L${P(a1, r)} A${r},${r} 0 ${large} 0 ${P(a0, r)} Z`;
    const s = `<path d="${d}" fill="${p.color}" class="seg drill" data-drill="${drillPrefix}:${escapeAttr(p.key)}"><title>${escapeHtml(p.label)}: ${p.value} (${Math.round((p.value / total) * 100)}%)</title></path>`;
    a0 = a1;
    return s;
  });
  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 160 160" class="donut" role="img" aria-label="Interactions by type">
        ${segs.join("")}
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-num">${total}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-lbl">total</text>
      </svg>
      <div class="legend legend-col">
        ${parts.map((p) => `<button class="legend-item drill" data-drill="${drillPrefix}:${escapeAttr(p.key)}"><span class="legend-dot" style="background:${p.color}"></span>${escapeHtml(p.label)}<span class="muted"> · ${p.value} (${Math.round((p.value / total) * 100)}%)</span></button>`).join("")}
      </div>
    </div>`;
}

function niceTicks(max, count) {
  const raw = Math.max(1, max / count); // counts: never sub-integer ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(Math.ceil(max / step) * step);
  return out;
}

function downloadCsv(name, rows) {
  if (!rows.length) return toast("Nothing to export", "error");
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + csv);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

function insightDetailHtml(name, rows, isUncategorized) {
  if (!rows.length) return `<div class="empty-state">No entries for <strong>${escapeHtml(name)}</strong> in this range.</div>`;

  const byMeister = groupBy(rows, (r) => r.meister_id).map(([id, items]) => ({ id, name: items[0].meisters?.name || "Unknown", dealership: items[0].meisters?.dealership, n: items.length })).sort((a, b) => b.n - a.n);
  const byPerson = groupBy(rows, (r) => r.created_by_name || "someone").map(([p, items]) => ({ p, n: items.length })).sort((a, b) => b.n - a.n);
  const byMethod = groupBy(rows, (r) => r.method).map(([m, items]) => ({ m, n: items.length })).sort((a, b) => b.n - a.n);

  // weekly trend, last 8 weeks
  const weeks = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay() - 7 * 7);
  for (let w = 0; w < 8; w++) {
    const s = new Date(start); s.setDate(s.getDate() + w * 7);
    const e = new Date(s); e.setDate(e.getDate() + 7);
    weeks.push({ s, n: rows.filter((r) => { const t = new Date(r.occurred_at); return t >= s && t < e; }).length });
  }
  const wmax = Math.max(1, ...weeks.map((w) => w.n));

  return `
    <div class="ins-detail-head">
      <h3>${I.tag} ${escapeHtml(name)}</h3>
      <span class="muted">${rows.length} ${rows.length === 1 ? "entry" : "entries"}</span>
    </div>
    ${isUncategorized ? `<p class="muted">These were logged without a question type. Set one below to include them in the report.</p>` : ""}

    <div class="ins-grid">
      <div>
        <div class="group-label" style="margin-top:0">Who's asking</div>
        <div class="mini-list">${byMeister.slice(0, 8).map((m) => `<a href="#/meister/${m.id}" class="mini-row"><span>${escapeHtml(m.name)}${m.dealership ? `<span class="muted"> · ${escapeHtml(m.dealership)}</span>` : ""}</span><strong>${m.n}</strong></a>`).join("")}${byMeister.length > 8 ? `<div class="muted">+${byMeister.length - 8} more</div>` : ""}</div>
      </div>
      <div>
        <div class="group-label" style="margin-top:0">Logged by</div>
        <div class="mini-list">${byPerson.map((p) => `<div class="mini-row"><span>${escapeHtml(p.p)}</span><strong>${p.n}</strong></div>`).join("")}</div>
        <div class="group-label">By method</div>
        <div class="mini-list">${byMethod.map((x) => `<div class="mini-row"><span class="method-badge method-${slug(x.m)}">${METHOD_ICON[x.m] || ""} ${escapeHtml(x.m)}</span><strong>${x.n}</strong></div>`).join("")}</div>
      </div>
    </div>

    <div class="group-label">Last 8 weeks</div>
    <div class="spark">${weeks.map((w) => `<div class="spark-col" title="Week of ${fmtDate(w.s.toISOString())}: ${w.n}"><div class="spark-bar" style="height:${(w.n / wmax) * 100}%"></div><span class="spark-lbl">${w.s.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span></div>`).join("")}</div>

    <div class="group-label">Notes</div>
    <div class="notes-list">
      ${rows
        .map(
          (r) => `
        <div class="note-card">
          <div class="note-top">
            <span class="method-badge method-${slug(r.method)}">${METHOD_ICON[r.method] || ""} ${escapeHtml(r.method)}</span>
            ${categorySelectHtml(r)}
            <a href="#/meister/${r.meister_id}" class="activity-meister">${escapeHtml(r.meisters?.name || "Unknown")}</a>
            <span class="muted">${escapeHtml(r.created_by_name || "someone")} &middot; ${fmtDateTime(r.occurred_at)}</span>
          </div>
          <div class="note-text">${escapeHtml(r.note)}</div>
        </div>`
        )
        .join("")}
    </div>`;
}

// ============================================================
// NOTIFICATIONS PAGE
// ============================================================
async function renderNotificationsPage(route, seq) {
  let items;
  try {
    items = await listNotifications(currentProfile.id, 150);
  } catch (err) {
    paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load notifications: ${escapeHtml(err.message)}</div>`));
    return;
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const unread = items.filter((n) => !n.read_at);
  const linked = !!currentProfile.concierge;

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Notifications</h1>
        <p class="muted">${
          linked
            ? `Activity by teammates on Meisters assigned to <strong>${escapeHtml(currentProfile.concierge)}</strong>. ${unread.length ? unread.length + " unread." : "You're caught up."}`
            : `Your login isn't linked to a Concierge name yet, so nothing routes here. Your admin can link it (see README).`
        }</p>
      </div>
      <div class="page-actions">
        ${unread.length ? `<button id="mark-all-btn" class="btn btn-ghost">${I.check} Mark all read</button>` : ""}
        <a href="#/account" class="btn btn-ghost">Preferences</a>
      </div>
    </div>
    ${
      items.length
        ? groupBy(items, (n) => dayLabel(n.created_at))
            .map(
              ([label, group]) => `
          <div class="group-label">${escapeHtml(label)}</div>
          <div class="notif-list">
            ${group
              .map(
                (n) => `
              <a href="#/meister/${n.meister_id}" class="notif ${n.read_at ? "" : "unread"}" data-id="${n.id}">
                <span class="notif-ic">${n.kind === "comment" ? I.reply : I.note}</span>
                <span class="notif-body">
                  <span class="notif-msg">${escapeHtml(n.message)}</span>
                  <span class="muted">${escapeHtml(n.meisters?.name || "")} · ${fmtTime(n.created_at)}</span>
                </span>
                ${n.read_at ? "" : `<span class="unread-dot"></span>`}
              </a>`
              )
              .join("")}
          </div>`
            )
            .join("")
        : `<div class="empty-state">Nothing yet. When a teammate comments on or logs activity for one of your Meisters, it shows up here.</div>`
    }
  `;

  document.getElementById("mark-all-btn")?.addEventListener("click", async () => {
    try {
      await markAllNotificationsRead(currentProfile.id);
      render();
    } catch (err) {
      toast("Couldn't update: " + err.message, "error");
    }
  });
  container.querySelectorAll(".notif.unread").forEach((a) =>
    a.addEventListener("click", () => {
      // fire-and-forget; navigation proceeds via the href
      markNotificationRead(a.dataset.id).catch(() => {});
    })
  );
}

// ============================================================
// ACCOUNT
// ============================================================
async function renderAccount(route, seq) {
  let team = [];
  try { team = await listTeam(); } catch { /* non-fatal */ }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  container.innerHTML = `
    <div class="page-header"><div><h1>Account</h1><p class="muted">Signed in as ${escapeHtml(currentProfile.email || "")}</p></div></div>
    <div class="account-grid">
      <form id="name-form" class="form-card">
        <h3>${I.person} Display name</h3>
        <p class="muted">This is the name stamped on every note and record you log.</p>
        <div class="form-field"><label>Name</label><input id="acct-name" data-draft value="${escapeAttr(dv("acct-name", currentProfile.full_name))}" required /></div>
        <button class="btn btn-primary" type="submit">Save name</button>
      </form>

      <form id="pw-form" class="form-card">
        <h3>${I.lock} Change password</h3>
        <p class="muted">Takes effect immediately, no email involved.</p>
        <div class="form-field"><label>New password</label><input id="acct-pw" type="password" minlength="8" autocomplete="new-password" required /></div>
        <div class="form-field"><label>Confirm new password</label><input id="acct-pw2" type="password" minlength="8" autocomplete="new-password" required /></div>
        <button class="btn btn-primary" type="submit">Update password</button>
      </form>

      <form id="notif-form" class="form-card">
        <h3>${I.bell} Notifications</h3>
        <p class="muted">${
          currentProfile.concierge
            ? `You're linked to Concierge <strong>${escapeHtml(currentProfile.concierge)}</strong>. You'll be notified when a teammate acts on a Meister assigned to ${escapeHtml(currentProfile.concierge)}.`
            : `Your login isn't linked to a Concierge name yet, so notifications won't route to you. Your admin can link it (see README).`
        }</p>
        <label class="pref-row"><input type="checkbox" id="pref-comments" ${currentProfile.notify_comments ? "checked" : ""} /> Someone comments on an activity</label>
        <label class="pref-row"><input type="checkbox" id="pref-activity" ${currentProfile.notify_activity ? "checked" : ""} /> Someone logs a call, text, email, or note</label>
        <p class="muted" style="margin:10px 0 12px">Email reminders aren't available yet; notifications show in the app (bell icon and a red dot on the Meister list).</p>
        <button class="btn btn-primary" type="submit">Save preferences</button>
      </form>

      ${isAdmin() ? categoryManagerHtml() : ""}

      <div class="form-card">
        <h3>${I.users} Team</h3>
        <p class="muted">${currentProfile.is_admin ? "You're an admin: you can delete meisters, notes, comments, and guests. Everyone else can add and edit." : "Only admins can delete records. Ask your team lead if something needs removing."}</p>
        <div class="team-list">
          ${team.map((t) => `<div class="team-row"><span class="user-avatar">${initials(t.full_name)}</span>${escapeHtml(t.full_name)}${t.id === currentProfile.id ? `<span class="muted"> (you)</span>` : ""}</div>`).join("") || `<div class="muted">No team members found.</div>`}
        </div>
      </div>
    </div>
  `;

  document.getElementById("name-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("acct-name").value.trim();
    if (!name) return;
    try {
      await setDisplayName(name);
      currentProfile.full_name = name;
      clearDrafts("acct-");
      toast("Display name updated");
      render();
    } catch (err) {
      toast("Couldn't update name: " + err.message, "error");
    }
  });

  if (isAdmin()) wireCategoryManager(container);

  document.getElementById("notif-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const prefs = {
      notify_comments: document.getElementById("pref-comments").checked,
      notify_activity: document.getElementById("pref-activity").checked,
    };
    try {
      await setNotificationPrefs(prefs);
      Object.assign(currentProfile, prefs);
      toast("Preferences saved");
    } catch (err) {
      toast("Couldn't save preferences: " + err.message, "error");
    }
  });

  document.getElementById("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = document.getElementById("acct-pw").value;
    const pw2 = document.getElementById("acct-pw2").value;
    if (pw !== pw2) return toast("Passwords don't match", "error");
    try {
      await changePassword(pw);
      e.target.reset();
      toast("Password updated");
    } catch (err) {
      toast("Couldn't update password: " + err.message, "error");
    }
  });
}

// ---------- admin: question category manager ----------
function categoryManagerHtml() {
  return `
    <div class="form-card cat-manager">
      <h3>${I.tag} Question types</h3>
      <p class="muted">The dropdown on the log box. Retire a type to hide it from the dropdown without losing history; remove only if it's never been used.</p>
      <div class="cat-list">
        ${categories
          .map((c) =>
            catMgrState.editingId === c.id
              ? `<form class="cat-row cat-edit-form" data-id="${c.id}">
                  <input id="cat-edit-${c.id}" data-draft value="${escapeAttr(dv(`cat-edit-${c.id}`, c.name))}" required />
                  <button type="submit" class="btn btn-primary btn-sm">Save</button>
                  <button type="button" class="btn btn-sm cat-cancel-btn">Cancel</button>
                </form>`
              : `<div class="cat-row ${c.active ? "" : "retired"}" data-id="${c.id}">
                  <span class="cat-name">${escapeHtml(c.name)}${c.active ? "" : ` <span class="muted">(retired)</span>`}</span>
                  <span class="fu-actions">
                    <button class="icon-btn" data-cat-edit="${c.id}" title="Rename">${I.edit}</button>
                    <button class="btn btn-ghost btn-sm" data-cat-toggle="${c.id}" data-active="${c.active ? "1" : "0"}">${c.active ? "Retire" : "Restore"}</button>
                    <button class="icon-btn danger" data-cat-delete="${c.id}" title="Remove">${I.trash}</button>
                  </span>
                </div>`
          )
          .join("") || `<div class="muted">No types yet.</div>`}
      </div>
      <form id="cat-add-form" class="cat-row" style="margin-top:12px">
        <input id="cat-new" data-draft placeholder="New question type" value="${escapeAttr(dv("cat-new", ""))}" required />
        <button type="submit" class="btn btn-primary btn-sm">${I.plus} Add</button>
      </form>
    </div>`;
}

function wireCategoryManager(container) {
  document.getElementById("cat-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("cat-new").value.trim();
    if (!name) return;
    try {
      await addCategory(name);
      clearDrafts("cat-new");
      toast(`Added "${name}"`);
      render();
    } catch (err) {
      toast(/duplicate|unique/i.test(err.message) ? `"${name}" already exists` : "Couldn't add: " + err.message, "error");
    }
  });
  container.querySelectorAll("[data-cat-edit]").forEach((b) =>
    b.addEventListener("click", () => { catMgrState.editingId = b.dataset.catEdit; render(); })
  );
  container.querySelectorAll(".cat-cancel-btn").forEach((b) =>
    b.addEventListener("click", () => { clearDrafts("cat-edit-"); catMgrState.editingId = null; render(); })
  );
  container.querySelectorAll(".cat-edit-form").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = f.dataset.id;
      const name = document.getElementById(`cat-edit-${id}`).value.trim();
      if (!name) return;
      try {
        await updateCategory(id, { name });
        clearDrafts("cat-edit-");
        catMgrState.editingId = null;
        toast("Renamed");
        render();
      } catch (err) {
        toast(/duplicate|unique/i.test(err.message) ? `"${name}" already exists` : "Couldn't rename: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll("[data-cat-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const active = b.dataset.active !== "1";
      try {
        await updateCategory(b.dataset.catToggle, { active });
        toast(active ? "Restored" : "Retired");
        render();
      } catch (err) {
        toast("Couldn't update: " + err.message, "error");
      }
    })
  );
  container.querySelectorAll("[data-cat-delete]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.catDelete;
      const c = catById(id);
      try {
        const uses = await countCategoryUses(id);
        if (uses > 0) {
          toast(`"${c?.name}" is on ${uses} logged ${uses === 1 ? "entry" : "entries"}. Retire it instead so the history stays intact.`, "error");
          return;
        }
        if (!confirm(`Remove "${c?.name}"? It has never been used.`)) return;
        await deleteCategory(id);
        toast("Removed");
        render();
      } catch (err) {
        toast("Couldn't remove: " + err.message, "error");
      }
    })
  );
}

// ============================================================
// MEISTER PAGE (view / new)
// ============================================================
async function renderMeister(route, seq) {
  const isNew = route.mode === "new";
  let meister = null, interactions = [], guests = [], followUps = [], comments = [];

  if (!isNew) {
    try {
      [meister, interactions, guests, followUps] = await Promise.all([
        getMeister(route.id),
        listInteractions(route.id),
        listGuests(route.id),
        listFollowUpsForMeister(route.id),
      ]);
      comments = await listCommentsForInteractions(interactions.map((i) => i.id));
    } catch {
      paint(route, seq, (c) => (c.innerHTML = `<div class="empty-state">Could not load this meister. They may have been removed.</div>`));
      return;
    }
    // Opening the Meister clears its unread notifications for you.
    if (myUnread.some((n) => n.meister_id === route.id)) {
      markMeisterNotificationsRead(currentProfile.id, route.id).catch(() => {});
      myUnread = myUnread.filter((n) => n.meister_id !== route.id);
    }
  }
  let container;
  if (!paint(route, seq, (c) => (container = c))) return;

  const defaultConcierge = CONCIERGES.find((c) => (currentProfile?.full_name || "").toLowerCase().startsWith(c.toLowerCase())) || "";
  const conciergeVal = dv("f-concierge", meister ? meister.concierge || "" : defaultConcierge);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <a href="#/dashboard" class="back-link">${I.back} All Meisters</a>
        <h1>${isNew ? "New Meister" : escapeHtml(meister.name)}</h1>
      </div>
      ${!isNew && isAdmin() ? `<button id="delete-btn" class="btn btn-danger">${I.trash} Delete</button>` : ""}
    </div>

    <div class="${isNew ? "" : "meister-layout"}">
      ${!isNew ? renderProfileSidebar(meister, followUps) : ""}
      <div>
        <div class="tabs" id="tabs">
          ${!isNew ? `<button class="tab-btn ${uiState.activeTab === "activity" ? "active" : ""}" data-tab="activity">Activity <span class="tab-count">${interactions.length}</span></button>` : ""}
          ${!isNew ? `<button class="tab-btn ${uiState.activeTab === "guests" ? "active" : ""}" data-tab="guests">Guests <span class="tab-count">${guests.length}</span></button>` : ""}
          <button class="tab-btn ${uiState.activeTab === "profile" ? "active" : ""}" data-tab="profile">${isNew ? "Profile" : "Edit Profile"}</button>
        </div>

        <div id="tab-profile" class="tab-panel" style="${uiState.activeTab === "profile" ? "" : "display:none"}">
          <form id="profile-form" class="form-card">
            <div class="form-grid">
              <div class="form-field"><label>Name *</label><input id="f-name" data-draft required value="${escapeAttr(dv("f-name", meister?.name))}" /></div>
              <div class="form-field"><label>Job Title</label><input id="f-job-title" data-draft placeholder="e.g. General Manager" value="${escapeAttr(dv("f-job-title", meister?.job_title))}" /></div>
              <div class="form-field"><label>Status</label>
                <select id="f-status" data-draft>${STATUSES.map((s) => `<option ${dv("f-status", meister?.status || "New") === s ? "selected" : ""}>${s}</option>`).join("")}</select>
              </div>
              <div class="form-field"><label>Concierge</label>
                <select id="f-concierge" data-draft>
                  <option value="" ${conciergeVal === "" ? "selected" : ""}>Unassigned</option>
                  ${CONCIERGES.map((c) => `<option ${conciergeVal === c ? "selected" : ""}>${c}</option>`).join("")}
                </select>
              </div>
              <div class="form-field"><label>Phone</label><input id="f-phone" data-draft type="tel" placeholder="(xxx) xxx-xxxx" value="${escapeAttr(dv("f-phone", formatPhone(meister?.phone)))}" /></div>
              <div class="form-field"><label>Email</label><input id="f-email" data-draft type="email" value="${escapeAttr(dv("f-email", meister?.email))}" /></div>
              <div class="form-field"><label>Dealership</label><input id="f-dealership" data-draft value="${escapeAttr(dv("f-dealership", meister?.dealership))}" /></div>
              <div class="form-field"><label>Dealership Website</label><input id="f-dealership-website" data-draft placeholder="https://…" value="${escapeAttr(dv("f-dealership-website", meister?.dealership_website))}" /></div>
              <div class="form-field"><label>City</label><input id="f-city" data-draft value="${escapeAttr(dv("f-city", meister?.city))}" /></div>
              <div class="form-field form-field-split">
                <div><label>State</label><input id="f-state" data-draft maxlength="2" style="text-transform:uppercase" value="${escapeAttr(dv("f-state", meister?.state))}" /></div>
                <div><label>Zip</label><input id="f-zip" data-draft inputmode="numeric" value="${escapeAttr(dv("f-zip", meister?.zip))}" /></div>
              </div>
            </div>
            <div class="form-field"><label>Profile Summary</label>
              <textarea id="f-summary" data-draft rows="4" placeholder="Who they are, interest level, what matters to them…">${escapeHtml(dv("f-summary", meister?.profile_summary))}</textarea>
            </div>
            ${isNew ? "" : `<div class="form-meta muted">Created by ${escapeHtml(meister.created_by_name || "—")} on ${fmtDate(meister.created_at)} &middot; Last updated by ${escapeHtml(meister.updated_by_name || "—")} ${relativeTime(meister.updated_at)}</div>`}
            <div class="composer-actions" style="justify-content:flex-start">
              <button type="submit" class="btn btn-primary">${isNew ? "Create Meister" : "Save Changes"}</button>
              ${isNew ? `<a href="#/dashboard" class="btn">Cancel</a>` : ""}
            </div>
          </form>
        </div>

        ${!isNew ? renderActivityTab(meister, interactions, followUps, comments) : ""}
        ${!isNew ? renderGuestsTab(guests) : ""}
      </div>
    </div>
  `;

  wireTabs();
  wirePhoneInput(document.getElementById("f-phone"));

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const g = (id) => document.getElementById(id).value.trim();
    const fields = {
      name: g("f-name"),
      job_title: g("f-job-title"),
      status: g("f-status"),
      concierge: g("f-concierge") || null,
      phone: formatPhone(g("f-phone")),
      email: g("f-email"),
      dealership: g("f-dealership"),
      dealership_website: g("f-dealership-website"),
      city: g("f-city"),
      state: g("f-state").toUpperCase(),
      zip: g("f-zip"),
      profile_summary: g("f-summary"),
    };
    if (!fields.name) return;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (isNew) {
        const created = await createMeister(fields, currentProfile.full_name, currentProfile.id);
        clearDrafts("f-");
        toast(`${created.name} added`);
        navigate(`#/meister/${created.id}`);
      } else {
        await updateMeister(meister.id, fields, currentProfile.full_name);
        clearDrafts("f-");
        toast("Profile saved");
        render();
      }
    } catch (err) {
      toast("Could not save: " + err.message, "error");
      btn.disabled = false;
    }
  });

  if (!isNew) {
    document.getElementById("delete-btn")?.addEventListener("click", async () => {
      if (!confirm(`Delete ${meister.name}? This also deletes all their logged conversations, comments, follow-ups, and guests. This cannot be undone.`)) return;
      try {
        await deleteMeister(meister.id);
        toast(`${meister.name} deleted`);
        navigate("#/dashboard");
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    });
    wireQuickActions();
    wireActivityTab(container, meister);
    wireGuestsTab(meister);

    if (uiState.focusId) {
      const el = document.getElementById(uiState.focusId);
      uiState.focusId = null;
      if (el) {
        el.focus();
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }
}

// ---------- sidebar ----------
function renderProfileSidebar(m, followUps) {
  const cityLine = [m.city, [m.state, m.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const role = [m.job_title, m.dealership].filter(Boolean).join(" · ");
  const mine = followUps.filter((f) => f.user_id === currentProfile.id && !f.done_at).sort((a, b) => (a.due_at < b.due_at ? -1 : 1))[0];
  return `
    <div class="card profile-sidebar">
      <div class="avatar">${initials(m.name)}</div>
      <div class="mname">${escapeHtml(m.name)}</div>
      ${role ? `<div class="mrole">${escapeHtml(role)}</div>` : ""}
      <div class="pill-row">
        <span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span>
        ${m.concierge ? `<span class="concierge-pill">${I.person} ${escapeHtml(m.concierge)}</span>` : ""}
      </div>

      <div class="quick-actions">
        ${QUICK_ACTIONS.map((a) => `<button type="button" class="qa-btn" data-method="${a.method}"><span class="qa-icon">${a.icon}</span>${a.label}</button>`).join("")}
      </div>
      <p class="muted qa-hint">Logs the conversation here. Doesn't dial, text, or send email.</p>

      ${mine ? `<div class="field"><label>My next follow-up</label><div class="fu-${followUpState(mine.due_at)}">${I.calendar} ${fmtDateTime(mine.due_at)}</div><div class="muted" style="font-size:12px">${escapeHtml(mine.title)}</div></div>` : ""}
      ${m.phone ? `<div class="field"><label>Phone</label><div>${escapeHtml(formatPhone(m.phone))}</div></div>` : ""}
      ${m.email ? `<div class="field"><label>Email</label><div>${escapeHtml(m.email)}</div></div>` : ""}
      ${m.dealership_website ? `<div class="field"><label>Dealership Website</label><div><a href="${escapeAttr(withProtocol(m.dealership_website))}" target="_blank" rel="noopener">${escapeHtml(m.dealership_website.replace(/^https?:\/\//i, ""))} ${I.link}</a></div></div>` : ""}
      ${cityLine ? `<div class="field"><label>Location</label><div>${escapeHtml(cityLine)}</div></div>` : ""}
      ${m.profile_summary ? `<div class="field"><label>Profile Summary</label><div class="summary-text">${escapeHtml(m.profile_summary)}</div></div>` : ""}
    </div>
  `;
}

function wireQuickActions() {
  document.querySelectorAll(".qa-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      uiState.activeTab = "activity";
      uiState.composerOpen = true;
      uiState.composerMethod = btn.dataset.method;
      uiState.focusId = "c-note";
      render();
    })
  );
}

// ---------- activity tab ----------
function renderActivityTab(meister, interactions, followUps, comments) {
  const pendingFus = followUps.filter((f) => !f.done_at);
  const doneFus = followUps.filter((f) => f.done_at);
  const fusByNote = {};
  for (const f of followUps) if (f.interaction_id) (fusByNote[f.interaction_id] ||= []).push(f);
  const commentsByNote = {};
  for (const c of comments) (commentsByNote[c.interaction_id] ||= []).push(c);

  // The feed is logged conversations plus completed follow-ups, newest first.
  const feed = [
    ...interactions.map((i) => ({ type: "note", time: i.occurred_at, method: i.method, data: i })),
    ...doneFus.map((f) => ({ type: "fu", time: f.done_at, method: "__fu", data: f })),
  ].sort((a, b) => (a.time < b.time ? 1 : -1));
  const filtered = uiState.methodFilter ? feed.filter((x) => x.method === uiState.methodFilter) : feed;

  return `
    <div id="tab-activity" class="tab-panel" style="${uiState.activeTab === "activity" ? "" : "display:none"}">
      <div class="toolbar">
        <div class="filter-chips" id="method-chips">
          <button type="button" class="chip ${!uiState.methodFilter ? "active" : ""}" data-method="">All <span class="chip-n">${feed.length}</span></button>
          ${METHODS.map((m) => {
            const n = interactions.filter((i) => i.method === m).length;
            return `<button type="button" class="chip ${uiState.methodFilter === m ? "active" : ""}" data-method="${m}">${METHOD_ICON[m]} ${m} <span class="chip-n">${n}</span></button>`;
          }).join("")}
          <button type="button" class="chip ${uiState.methodFilter === "__fu" ? "active" : ""}" data-method="__fu">${I.check} Done <span class="chip-n">${doneFus.length}</span></button>
        </div>
        <div class="page-actions">
          <button type="button" id="open-fu-btn" class="btn btn-ghost">${I.bell} Follow-up</button>
          <button type="button" id="toggle-composer-btn" class="btn btn-primary">${I.plus} Log Activity</button>
        </div>
      </div>

      ${uiState.fuFormOpen && !uiState.editingFuId ? fuFormHtml(null, meister.name) : ""}
      ${uiState.composerOpen ? composerHtml() : ""}

      ${
        pendingFus.length
          ? `<div class="fu-panel">
              <div class="group-label" style="margin-top:0">Pending follow-ups</div>
              <div class="fu-list">${pendingFus.map((f) => (uiState.editingFuId === f.id ? fuFormHtml(f, meister.name) : fuRowHtml(f, meister.name, false))).join("")}</div>
            </div>`
          : ""
      }

      ${
        filtered.length
          ? groupBy(filtered, (x) => monthLabel(x.time))
              .map(
                ([label, items]) => `
            <div class="group-label">${escapeHtml(label)}</div>
            <div class="notes-list">
              ${items.map((x) => (x.type === "fu" ? fuDoneCardHtml(x.data) : noteCardHtml(x.data, fusByNote[x.data.id] || [], commentsByNote[x.data.id] || []))).join("")}
            </div>`
              )
              .join("")
          : `<div class="empty-state">${feed.length ? "Nothing in this filter yet." : "No conversations logged yet. Use Call / Text / Email / Note on the left to add one."}</div>`
      }
    </div>
  `;
}

function fuDoneCardHtml(f) {
  const mine = canManageFu(f);
  return `
    <div class="note-card fu-done-card" data-fu-id="${f.id}">
      <div class="note-top">
        <span class="method-badge method-followup">${I.check} Follow-up</span>
        <span class="muted">${escapeHtml(f.user_name || "someone")} &middot; completed ${fmtDateTime(f.done_at)}</span>
        <span class="note-actions">
          ${mine ? `<button class="icon-btn" data-fu-toggle="${f.id}" data-done="1" title="Mark not done">${I.circle}</button>
          <button class="icon-btn danger" data-fu-delete="${f.id}" title="Delete">${I.trash}</button>` : ""}
        </span>
      </div>
      <div class="note-text">${escapeHtml(f.title)} <span class="muted">· was due ${fmtDateTime(f.due_at)}</span></div>
    </div>`;
}

// Category chip that is also a dropdown: pick a type, or change a wrong one.
function categorySelectHtml(i) {
  const cur = catById(i.category_id);
  const opts = activeCategories().slice();
  if (cur && !cur.active) opts.push(cur); // keep a retired type visible on old entries
  return `
    <span class="cat-chip ${cur ? "has" : ""}">
      ${I.tag}
      <select class="cat-select" data-note="${i.id}" title="Question type">
        <option value="" ${!cur ? "selected" : ""}>${cur ? "No type" : "+ Question type"}</option>
        ${opts.map((c) => `<option value="${c.id}" ${cur?.id === c.id ? "selected" : ""}>${escapeHtml(c.name)}${c.active ? "" : " (retired)"}</option>`).join("")}
      </select>
    </span>`;
}

function noteCardHtml(i, fus, cmts) {
  return `
    <div class="note-card" data-note-id="${i.id}">
      <div class="note-top">
        <span class="method-badge method-${slug(i.method)}">${METHOD_ICON[i.method] || ""} ${escapeHtml(i.method)}</span>
        ${categorySelectHtml(i)}
        <span class="muted">${escapeHtml(i.created_by_name || "someone")} &middot; ${fmtDateTime(i.occurred_at)}</span>
        <span class="note-actions">
          ${isAdmin() ? `<button class="icon-btn danger delete-note-btn" data-id="${i.id}" title="Delete">${I.trash}</button>` : ""}
        </span>
      </div>
      <div class="note-text">${escapeHtml(i.note)}</div>
      ${
        fus.length
          ? `<div class="note-fus">${fus
              .map((f) => {
                const st = f.done_at ? "done" : followUpState(f.due_at);
                return `<span class="fu-chip fu-${st}" title="${escapeAttr(f.user_name || "")}">${f.done_at ? I.check : I.calendar} ${escapeHtml(f.title)} · ${f.done_at ? "done" : fmtDateTime(f.due_at)}</span>`;
              })
              .join("")}</div>`
          : ""
      }
      <div class="comments">
        ${cmts.map((c) => (uiState.editingCommentId === c.id ? commentFormHtml(i.id, c) : commentHtml(c))).join("")}
        ${
          uiState.replyingTo === i.id
            ? commentFormHtml(i.id, null)
            : `<button type="button" class="reply-btn" data-reply="${i.id}">${I.reply} ${cmts.length ? "Reply" : "Comment"}</button>`
        }
      </div>
    </div>`;
}

function commentHtml(c) {
  const own = c.created_by === currentProfile.id;
  return `
    <div class="comment">
      <span class="user-avatar">${initials(c.created_by_name)}</span>
      <div class="comment-body">
        <div class="comment-meta"><strong>${escapeHtml(c.created_by_name || "someone")}</strong> <span class="muted">${fmtDateTime(c.created_at)}${c.edited_at ? " · <em>edited</em>" : ""}</span>
          <span class="note-actions">
            ${own || isAdmin() ? `<button class="icon-btn edit-comment-btn" data-id="${c.id}" title="Edit">${I.edit}</button>` : ""}
            ${isAdmin() ? `<button class="icon-btn danger delete-comment-btn" data-id="${c.id}" title="Delete">${I.trash}</button>` : ""}
          </span>
        </div>
        <div class="comment-text">${escapeHtml(c.body)}</div>
      </div>
    </div>`;
}

function commentFormHtml(noteId, existing) {
  const p = existing ? `cme-${existing.id}-` : `cm-${noteId}-`;
  return `
    <form class="comment-form" data-prefix="${p}" data-note-id="${noteId}" data-edit-id="${existing ? existing.id : ""}">
      <span class="user-avatar">${initials(currentProfile.full_name)}</span>
      <div class="comment-body">
        <textarea id="${p}body" data-draft rows="2" required placeholder="Add a comment…">${escapeHtml(dv(`${p}body`, existing ? existing.body : ""))}</textarea>
        <div class="composer-actions" style="margin-top:8px">
          <button type="button" class="btn btn-sm cancel-comment-btn">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">${existing ? "Save" : "Post"}</button>
        </div>
      </div>
    </form>`;
}

function composerHtml() {
  const p = "c-";
  const method = dv(`${p}method`, uiState.composerMethod);
  const when = dv(`${p}when`, toLocalInput(new Date().toISOString()));
  const note = dv(`${p}note`, "");
  const withFu = uiState.composerWithFollowUp;
  return `
    <form class="composer" data-prefix="${p}">
      <div class="composer-top">
        <select id="${p}method" data-draft>${METHODS.map((m) => `<option ${method === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        <input id="${p}when" data-draft type="datetime-local" value="${escapeAttr(when)}" required />
        <select id="${p}category" data-draft title="Question type (optional)">
          <option value="" ${!dv(`${p}category`, "") ? "selected" : ""}>Question type (optional)</option>
          ${activeCategories().map((c) => `<option value="${c.id}" ${dv(`${p}category`, "") === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>
      <textarea id="${p}note" data-draft rows="3" required placeholder="What did you talk about? Any follow-up needed?">${escapeHtml(note)}</textarea>
      <label class="fu-toggle"><input type="checkbox" id="c-fu-on" ${withFu ? "checked" : ""} /> ${I.bell} Set a follow-up reminder</label>
      ${
        withFu
          ? `<div class="fu-form-grid" style="margin-top:8px">
              <input id="c-fu-title" data-draft placeholder="Follow-up title" value="${escapeAttr(dv("c-fu-title", ""))}" />
              <input id="c-fu-when" data-draft type="datetime-local" value="${escapeAttr(dv("c-fu-when", toLocalInput(defaultFollowUpTime())))}" />
            </div>`
          : ""
      }
      <p class="muted composer-note">Logged entries can't be edited afterward. Add anything extra as a comment.</p>
      <div class="composer-actions">
        <button type="button" class="btn cancel-composer-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Log it</button>
      </div>
    </form>`;
}

function wireActivityTab(container, meister) {
  document.querySelectorAll("#method-chips .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      uiState.methodFilter = chip.dataset.method;
      render();
    })
  );

  document.getElementById("toggle-composer-btn")?.addEventListener("click", () => {
    uiState.composerOpen = true;
    uiState.focusId = "c-note";
    render();
  });
  document.getElementById("open-fu-btn")?.addEventListener("click", () => {
    uiState.fuFormOpen = true;
    uiState.editingFuId = null;
    uiState.focusId = "fu-title";
    render();
  });

  // follow-up toggle inside the composer
  document.getElementById("c-fu-on")?.addEventListener("change", (e) => {
    uiState.composerWithFollowUp = e.target.checked;
    uiState.focusId = e.target.checked ? "c-fu-title" : "c-note";
    render();
  });

  document.querySelectorAll(".composer:not(.fu-form)").forEach((form) => {
    const prefix = form.dataset.prefix;

    form.querySelector(".cancel-composer-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      clearDrafts("c-fu-");
      uiState.composerOpen = false;
      uiState.composerWithFollowUp = false;
      render();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        method: document.getElementById(`${prefix}method`).value,
        occurred_at: fromLocalInput(document.getElementById(`${prefix}when`).value),
        note: document.getElementById(`${prefix}note`).value.trim(),
        category_id: document.getElementById(`${prefix}category`).value || null,
      };
      if (!payload.note || !payload.occurred_at) return;

      let fu = null;
      if (uiState.composerWithFollowUp) {
        const title = document.getElementById("c-fu-title")?.value.trim();
        const due_at = fromLocalInput(document.getElementById("c-fu-when")?.value);
        if (!title || !due_at) return toast("Give the follow-up a title and a time, or untick it.", "error");
        fu = { title, due_at };
      }

      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const created = await addInteraction(meister.id, payload, currentProfile.full_name, currentProfile.id);
        if (fu) await addFollowUp({ meister_id: meister.id, interaction_id: created.id, ...fu }, currentProfile.full_name, currentProfile.id);
        uiState.composerOpen = false;
        uiState.composerWithFollowUp = false;
        toast(`${payload.method === "Other" ? "Note" : payload.method} logged${fu ? " + follow-up set" : ""}`);
        clearDrafts(prefix);
        clearDrafts("c-fu-");
        render();
      } catch (err) {
        toast("Could not save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  wireCategorySelects(container);

  document.querySelectorAll(".delete-note-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this logged entry and its comments? This cannot be undone.")) return;
      try {
        await deleteInteraction(btn.dataset.id);
        toast("Note deleted");
        render();
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    })
  );

  // comments
  document.querySelectorAll(".reply-btn").forEach((b) =>
    b.addEventListener("click", () => {
      uiState.replyingTo = b.dataset.reply;
      uiState.editingCommentId = null;
      uiState.focusId = `cm-${b.dataset.reply}-body`;
      render();
    })
  );
  document.querySelectorAll(".edit-comment-btn").forEach((b) =>
    b.addEventListener("click", () => {
      uiState.editingCommentId = b.dataset.id;
      uiState.replyingTo = null;
      uiState.focusId = `cme-${b.dataset.id}-body`;
      render();
    })
  );
  document.querySelectorAll(".delete-comment-btn").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this comment?")) return;
      try {
        await deleteComment(b.dataset.id);
        toast("Comment deleted");
        render();
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    })
  );
  document.querySelectorAll(".comment-form").forEach((form) => {
    const prefix = form.dataset.prefix;
    const editId = form.dataset.editId;
    const noteId = form.dataset.noteId;
    form.querySelector(".cancel-comment-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      if (editId) uiState.editingCommentId = null;
      else uiState.replyingTo = null;
      render();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = document.getElementById(`${prefix}body`).value.trim();
      if (!body) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (editId) {
          await updateComment(editId, body);
          uiState.editingCommentId = null;
          toast("Comment updated");
        } else {
          await addComment(noteId, body, currentProfile.full_name, currentProfile.id);
          uiState.replyingTo = null;
          toast("Comment posted");
        }
        clearDrafts(prefix);
        render();
      } catch (err) {
        toast("Could not save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  // follow-ups on this meister
  wireFollowUpControls(container, {
    meisterId: meister.id,
    onEdit: (id) => { uiState.editingFuId = id; uiState.fuFormOpen = false; uiState.focusId = `fue-${id}-title`; render(); },
    onCancel: (editId) => { if (editId) uiState.editingFuId = null; else uiState.fuFormOpen = false; render(); },
    afterSave: (editId) => { if (editId) uiState.editingFuId = null; else uiState.fuFormOpen = false; },
  });
}

// ---------- guests tab ----------
function renderGuestsTab(guests) {
  return `
    <div id="tab-guests" class="tab-panel" style="${uiState.activeTab === "guests" ? "" : "display:none"}">
      <div class="toolbar">
        <p class="muted" style="margin:0">Guests this Meister has referred or sold a vehicle to.</p>
        <button type="button" id="add-guest-btn" class="btn btn-primary">${I.plus} Add Guest</button>
      </div>

      ${uiState.guestFormOpen && !uiState.editingGuestId ? guestFormHtml(null) : ""}

      <div class="table-wrap">
        <table class="crm-table">
          <thead><tr><th>Guest</th><th>Vehicle</th><th>Purchase Date</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            ${
              guests.length
                ? guests
                    .map((g) =>
                      uiState.editingGuestId === g.id
                        ? `<tr><td colspan="5" class="td-form">${guestFormHtml(g)}</td></tr>`
                        : `<tr>
                        <td class="cell-name">${escapeHtml(g.guest_name)}<div class="muted cell-sub">added by ${escapeHtml(g.created_by_name || "—")}</div></td>
                        <td>${escapeHtml(g.vehicle_purchased || "—")}</td>
                        <td>${g.purchase_date ? fmtDate(g.purchase_date) : "—"}</td>
                        <td>${escapeHtml(g.notes || "—")}</td>
                        <td class="td-actions">
                          <button class="icon-btn edit-guest-btn" data-id="${g.id}" title="Edit">${I.edit}</button>
                          ${isAdmin() ? `<button class="icon-btn danger delete-guest-btn" data-id="${g.id}" title="Delete">${I.trash}</button>` : ""}
                        </td>
                      </tr>`
                    )
                    .join("")
                : `<tr><td colspan="5"><div class="empty-state">No guests logged yet.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function guestFormHtml(existing) {
  const p = existing ? `ge-${existing.id}-` : "g-";
  return `
    <form class="form-card guest-form" data-edit-id="${existing ? existing.id : ""}" data-prefix="${p}">
      <div class="form-grid">
        <div class="form-field"><label>Guest Name *</label><input id="${p}name" data-draft required value="${escapeAttr(dv(`${p}name`, existing?.guest_name))}" /></div>
        <div class="form-field"><label>Vehicle Purchased</label><input id="${p}vehicle" data-draft placeholder="e.g. GR GT" value="${escapeAttr(dv(`${p}vehicle`, existing?.vehicle_purchased))}" /></div>
        <div class="form-field"><label>Purchase Date</label><input id="${p}date" data-draft type="date" value="${escapeAttr(dv(`${p}date`, existing?.purchase_date))}" /></div>
        <div class="form-field"><label>Notes</label><input id="${p}notes" data-draft value="${escapeAttr(dv(`${p}notes`, existing?.notes))}" /></div>
      </div>
      <div class="composer-actions">
        <button type="button" class="btn cancel-guest-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">${existing ? "Save changes" : "Add Guest"}</button>
      </div>
    </form>`;
}

function wireGuestsTab(meister) {
  document.getElementById("add-guest-btn")?.addEventListener("click", () => {
    uiState.guestFormOpen = true;
    uiState.editingGuestId = null;
    uiState.focusId = "g-name";
    render();
  });

  document.querySelectorAll(".guest-form").forEach((form) => {
    const prefix = form.dataset.prefix;
    const editId = form.dataset.editId;
    form.querySelector(".cancel-guest-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      if (editId) uiState.editingGuestId = null;
      else uiState.guestFormOpen = false;
      render();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const g = (s) => document.getElementById(`${prefix}${s}`).value.trim();
      const fields = { guest_name: g("name"), vehicle_purchased: g("vehicle"), purchase_date: g("date") || null, notes: g("notes") };
      if (!fields.guest_name) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (editId) {
          await updateGuest(editId, fields);
          uiState.editingGuestId = null;
          toast("Guest updated");
        } else {
          await addGuest(meister.id, fields, currentProfile.full_name, currentProfile.id);
          uiState.guestFormOpen = false;
          toast("Guest added");
        }
        clearDrafts(prefix);
        render();
      } catch (err) {
        toast("Could not save guest: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".edit-guest-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      uiState.editingGuestId = btn.dataset.id;
      uiState.guestFormOpen = false;
      render();
    })
  );
  document.querySelectorAll(".delete-guest-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this guest record? This cannot be undone.")) return;
      try {
        await deleteGuest(btn.dataset.id);
        toast("Guest deleted");
        render();
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    })
  );
}

function wireTabs() {
  document.querySelectorAll("#tabs .tab-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      uiState.activeTab = btn.dataset.tab;
      render();
    })
  );
}

function wirePhoneInput(input) {
  if (!input) return;
  input.addEventListener("input", () => {
    const atEnd = input.selectionEnd === input.value.length;
    input.value = formatPhone(input.value);
    if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
}

// ============================================================
// UTIL
// ============================================================
function isAdmin() {
  return !!currentProfile?.is_admin;
}

function toast(msg, kind = "ok") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${kind === "error" ? I.alert : I.check}<span>${escapeHtml(msg)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, kind === "error" ? 5000 : 2500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(str) {
  return escapeHtml(str || "");
}
function slug(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function initials(name) {
  return (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => (w[0] || "").toUpperCase())
    .join("");
}
function formatPhone(value) {
  if (!value) return "";
  const d = String(value).replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
function withProtocol(url) {
  if (!url) return "#";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function groupBy(list, keyFn) {
  const out = [];
  const idx = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!idx.has(k)) {
      idx.set(k, out.length);
      out.push([k, []]);
    }
    out[idx.get(k)][1].push(item);
  }
  return out;
}

// ---- dates ----
function pad(n) { return String(n).padStart(2, "0"); }
function toLocalInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
function parseDateOnly(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00") : new Date(v);
}
function fmtDate(v) {
  if (!v) return "";
  return parseDateOnly(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" })}, ${fmtTime(iso)}`;
}
function monthLabel(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
// Works for both date-only strings (legacy) and full timestamps.
function followUpState(v) {
  if (!v) return null;
  const now = new Date();
  const d = parseDateOnly(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d < today) return "overdue";
    if (d.getTime() === today.getTime()) return "today";
    return "upcoming";
  }
  if (d < now) return "overdue";
  if (d.toDateString() === now.toDateString()) return "today";
  return "upcoming";
}
function followUpChip(v) {
  const s = followUpState(v);
  if (!s) return `<span class="muted">—</span>`;
  const label = s === "overdue" ? "Overdue" : s === "today" ? `Today ${fmtTime(v)}` : fmtDateTime(v);
  return `<span class="fu-chip fu-${s}">${I.calendar} ${label}</span>${s === "overdue" ? `<div class="muted cell-sub">${fmtDateTime(v)}</div>` : ""}`;
}
function relativeTime(iso) {
  if (!iso) return "—";
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const m = Math.round(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso);
}
