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
  updateInteraction,
  deleteInteraction,
  listGuests,
  addGuest,
  updateGuest,
  deleteGuest,
  listRecentActivity,
  subscribeToChanges,
} from "./api.js";
import { exportToExcel } from "./export.js";

const app = document.getElementById("app");
let currentProfile = null;
let unsubscribeRealtime = null;

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
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  sort: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
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
// Per-meister-page UI state (reset when the route key changes)
let uiState = freshUiState("activity");
function freshUiState(tab) {
  return {
    activeTab: tab,
    composerOpen: false,
    composerMethod: "Phone",
    editingNoteId: null,
    methodFilter: "",
    guestFormOpen: false,
    editingGuestId: null,
    focusComposer: false,
  };
}

// Dashboard filters/sort survive live re-renders
const dashState = { q: "", status: "", concierge: "", sort: "updated", dir: "desc" };
// Activity-log filters
const actState = { q: "", method: "", person: "" };

// Draft preservation: anything typed into a [data-draft] field survives a
// re-render (live update from a teammate, tab switch, filter click…).
// Only DIRTY fields are captured, so fresh server values still win when
// the user hasn't touched a field.
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
    if (dirty) drafts[el.id] = el.value;
    else delete drafts[el.id];
  });
}
function dv(id, fallback = "") {
  return id in drafts ? drafts[id] : fallback ?? "";
}
function clearDrafts(prefix) {
  for (const k of Object.keys(drafts)) if (!prefix || k.startsWith(prefix)) delete drafts[k];
}

// ============================================================
// ROUTER  (hash-based — works with GitHub Pages + browser back/forward)
// ============================================================
window.addEventListener("hashchange", () => render());
window.addEventListener("DOMContentLoaded", init);

async function init() {
  // Toasts live outside #app so re-renders don't wipe them mid-fade.
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
      // Supabase re-fires SIGNED_IN on tab focus / token refresh even when
      // already logged in — only treat it as a real login if we weren't.
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
    if (["dashboard", "activity"].includes(route.name)) render({ live: true });
    if (route.name === "meister" && route.mode === "view") render({ live: true });
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
  if (parts[0] === "account") return { name: "account", key: "account" };
  if (parts[0] === "meister" && parts[1] === "new") return { name: "meister", mode: "new", key: "meister:new" };
  if (parts[0] === "meister" && parts[1]) return { name: "meister", mode: "view", id: parts[1], key: `meister:${parts[1]}` };
  return { name: "dashboard", key: "dashboard" };
}

// ============================================================
// RENDER  (guarded so overlapping renders can't clobber each other)
// ============================================================
let renderSeq = 0;

async function render(opts = {}) {
  const seq = ++renderSeq;
  const route = parseHash();

  // Drafts belong to one page. Leaving the page discards them.
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

  // First paint of a page shows a loading shell; live refreshes of the same
  // page fetch first and swap the DOM once, so nothing flashes.
  if (route.key !== lastPaintedKey || !app.querySelector(".shell")) {
    renderShell(route, (c) => (c.innerHTML = `<div class="loading">Loading…</div>`));
    lastPaintedKey = route.key;
  }

  if (route.name === "dashboard") return renderDashboard(route, seq);
  if (route.name === "activity") return renderActivity(route, seq);
  if (route.name === "account") return renderAccount(route, seq);
  if (route.name === "meister") return renderMeister(route, seq);
}
let lastPaintedKey = null;

function renderShell(route, contentFn) {
  // Grab anything typed during the fetch window so a live refresh never eats keystrokes.
  if (route.key === draftsRouteKey) captureDrafts();
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a href="#/dashboard" class="brand"><span class="brand-dot"></span><span>GR GT Concierge CRM</span></a>
        <nav class="nav">
          <a href="#/dashboard" class="${route.name === "dashboard" || route.name === "meister" ? "active" : ""}">Meisters</a>
          <a href="#/activity" class="${route.name === "activity" ? "active" : ""}">Activity Log</a>
        </nav>
        <div class="user-area">
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
    [meisters, rollups] = await Promise.all([listMeisters(), listMeisterRollups()]);
  } catch (err) {
    if (seq !== renderSeq) return;
    return renderShell(route, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load meisters: ${escapeHtml(err.message)}</div>`));
  }
  if (seq !== renderSeq) return;
  let container;
  renderShell(route, (c) => (container = c));

  meisters.forEach((m) => Object.assign(m, rollups[m.id] || { last_contact: null, interaction_count: 0, guest_count: 0 }));

  const counts = { total: meisters.length, overdue: 0 };
  STATUSES.forEach((s) => (counts[s] = 0));
  meisters.forEach((m) => {
    counts[m.status] = (counts[m.status] || 0) + 1;
    if (followUpState(m.next_follow_up) === "overdue") counts.overdue++;
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
      <button class="kpi kpi-alert ${dashState.status === "__overdue" ? "active" : ""}" data-status="__overdue"><span class="kpi-num">${counts.overdue}</span><span class="kpi-label">Overdue</span></button>
    </div>

    <div class="filters">
      <div class="search-box">${I.search}<input id="search-input" type="text" placeholder="Search name, dealership, city, phone, email…" value="${escapeAttr(dashState.q)}" /></div>
      <select id="status-filter">
        <option value="">All Statuses</option>
        ${STATUSES.map((s) => `<option ${dashState.status === s ? "selected" : ""}>${s}</option>`).join("")}
        <option value="__overdue" ${dashState.status === "__overdue" ? "selected" : ""}>Overdue follow-ups</option>
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
            ${th("follow_up", "Follow-Up")}
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
      await exportToExcel();
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
      !q || [m.name, m.dealership, m.city, m.phone, m.email, m.concierge].some((f) => (f || "").toLowerCase().includes(q));
    const matchesStatus =
      !dashState.status ||
      (dashState.status === "__overdue" ? followUpState(m.next_follow_up) === "overdue" : m.status === dashState.status);
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
    follow_up: (m) => m.next_follow_up || "",
    last_contact: (m) => m.last_contact || "",
    updated: (m) => m.updated_at || "",
  }[dashState.sort];
  filtered.sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    // empty values always sink to the bottom regardless of direction
    if (ka === "" && kb !== "") return 1;
    if (kb === "" && ka !== "") return -1;
    return ka < kb ? -dir : ka > kb ? dir : 0;
  });

  const tbody = document.getElementById("meister-rows");
  const emptyState = document.getElementById("empty-state");
  emptyState.style.display = filtered.length ? "none" : "block";
  tbody.innerHTML = filtered
    .map(
      (m) => `
      <tr class="clickable-row" data-id="${m.id}">
        <td class="cell-name">
          <div>${escapeHtml(m.name)}</div>
          <div class="muted cell-sub">${escapeHtml(formatPhone(m.phone) || m.email || "")}</div>
        </td>
        <td>${escapeHtml(m.dealership || "—")}${m.city ? `<div class="muted cell-sub">${escapeHtml([m.city, m.state].filter(Boolean).join(", "))}</div>` : ""}</td>
        <td>${escapeHtml(m.concierge || "—")}</td>
        <td><span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span></td>
        <td>${followUpChip(m.next_follow_up)}</td>
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
  let activity;
  try {
    activity = await listRecentActivity(300);
  } catch (err) {
    if (seq !== renderSeq) return;
    return renderShell(route, (c) => (c.innerHTML = `<div class="empty-state">Couldn't load activity: ${escapeHtml(err.message)}</div>`));
  }
  if (seq !== renderSeq) return;
  let container;
  renderShell(route, (c) => (container = c));

  const people = [...new Set(activity.map((a) => a.created_by_name).filter(Boolean))].sort();

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
    </div>
    <div class="filter-chips" id="act-chips" style="margin-bottom:16px">
      <button class="chip ${!actState.method ? "active" : ""}" data-method="">All</button>
      ${METHODS.map((m) => `<button class="chip ${actState.method === m ? "active" : ""}" data-method="${m}">${METHOD_ICON[m]} ${m}</button>`).join("")}
    </div>
    <div id="act-feed"></div>
  `;

  const draw = () => {
    const q = actState.q.toLowerCase().trim();
    const list = activity.filter(
      (a) =>
        (!actState.method || a.method === actState.method) &&
        (!actState.person || a.created_by_name === actState.person) &&
        (!q || (a.note || "").toLowerCase().includes(q) || (a.meisters?.name || "").toLowerCase().includes(q))
    );
    const feed = document.getElementById("act-feed");
    if (!list.length) {
      feed.innerHTML = `<div class="empty-state">${activity.length ? "Nothing matches those filters." : "No activity logged yet. Notes your team adds will show up here."}</div>`;
      return;
    }
    feed.innerHTML = groupBy(list, (a) => dayLabel(a.occurred_at))
      .map(
        ([label, items]) => `
        <div class="group-label">${escapeHtml(label)}</div>
        <div class="activity-feed">
          ${items
            .map(
              (a) => `
            <div class="activity-item">
              <span class="method-badge method-${slug(a.method)}">${METHOD_ICON[a.method] || ""} ${escapeHtml(a.method)}</span>
              <div class="activity-body">
                <div class="activity-top">
                  <a href="#/meister/${a.meister_id}" class="activity-meister">${escapeHtml(a.meisters?.name || "Unknown Meister")}</a>
                  <span class="muted">by ${escapeHtml(a.created_by_name || "someone")}</span>
                  <span class="muted activity-time">${fmtTime(a.occurred_at)}</span>
                </div>
                <div class="activity-note">${escapeHtml(a.note)}</div>
              </div>
            </div>`
            )
            .join("")}
        </div>`
      )
      .join("");
  };

  document.getElementById("act-search").addEventListener("input", (e) => { actState.q = e.target.value; draw(); });
  document.getElementById("act-person").addEventListener("change", (e) => { actState.person = e.target.value; draw(); });
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
// ACCOUNT
// ============================================================
async function renderAccount(route, seq) {
  let team = [];
  try { team = await listTeam(); } catch { /* non-fatal */ }
  if (seq !== renderSeq) return;
  let container;
  renderShell(route, (c) => (container = c));

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

      <div class="form-card">
        <h3>${I.users} Team</h3>
        <p class="muted">${currentProfile.is_admin ? "You're an admin: you can delete meisters, notes, and guests. Everyone else can add and edit." : "Only admins can delete records. Ask your team lead if something needs removing."}</p>
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

// ============================================================
// MEISTER PAGE (view / new)
// ============================================================
async function renderMeister(route, seq) {
  const isNew = route.mode === "new";
  let meister = null, interactions = [], guests = [];

  if (!isNew) {
    try {
      [meister, interactions, guests] = await Promise.all([getMeister(route.id), listInteractions(route.id), listGuests(route.id)]);
    } catch {
      if (seq !== renderSeq) return;
      return renderShell(route, (c) => (c.innerHTML = `<div class="empty-state">Could not load this meister. They may have been removed.</div>`));
    }
    if (seq !== renderSeq) return;
  }
  let container;
  renderShell(route, (c) => (container = c));

  const defaultConcierge = CONCIERGES.find((c) => (currentProfile?.full_name || "").toLowerCase().startsWith(c.toLowerCase())) || "";

  container.innerHTML = `
    <div class="page-header">
      <div>
        <a href="#/dashboard" class="back-link">${I.back} All Meisters</a>
        <h1>${isNew ? "New Meister" : escapeHtml(meister.name)}</h1>
      </div>
      ${!isNew && isAdmin() ? `<button id="delete-btn" class="btn btn-danger">${I.trash} Delete</button>` : ""}
    </div>

    <div class="${isNew ? "" : "meister-layout"}">
      ${!isNew ? renderProfileSidebar(meister) : ""}
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
              <div class="form-field"><label>Status</label>
                <select id="f-status" data-draft>${STATUSES.map((s) => `<option ${dv("f-status", meister?.status || "New") === s ? "selected" : ""}>${s}</option>`).join("")}</select>
              </div>
              <div class="form-field"><label>Concierge</label>
                <select id="f-concierge" data-draft>
                  <option value="" ${dv("f-concierge", meister ? meister.concierge || "" : defaultConcierge) === "" ? "selected" : ""}>Unassigned</option>
                  ${CONCIERGES.map((c) => `<option ${dv("f-concierge", meister ? meister.concierge || "" : defaultConcierge) === c ? "selected" : ""}>${c}</option>`).join("")}
                </select>
              </div>
              <div class="form-field"><label>Next Follow-Up</label><input id="f-follow-up" data-draft type="date" value="${escapeAttr(dv("f-follow-up", meister?.next_follow_up))}" /></div>
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

        ${!isNew ? renderActivityTab(interactions) : ""}
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
      status: g("f-status"),
      concierge: g("f-concierge") || null,
      next_follow_up: g("f-follow-up") || null,
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
      if (!confirm(`Delete ${meister.name}? This also deletes all their logged conversations and guests. This cannot be undone.`)) return;
      try {
        await deleteMeister(meister.id);
        toast(`${meister.name} deleted`);
        navigate("#/dashboard");
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    });
    wireQuickActions();
    wireActivityTab(meister);
    wireGuestsTab(meister);

    if (uiState.focusComposer) {
      uiState.focusComposer = false;
      const ta = document.getElementById("c-note");
      if (ta) {
        ta.focus();
        ta.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }
}

// ---------- sidebar ----------
function renderProfileSidebar(m) {
  const cityLine = [m.city, [m.state, m.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const fu = followUpState(m.next_follow_up);
  return `
    <div class="card profile-sidebar">
      <div class="avatar">${initials(m.name)}</div>
      <div class="mname">${escapeHtml(m.name)}</div>
      ${m.dealership ? `<div class="mrole">${escapeHtml(m.dealership)}</div>` : ""}
      <div class="pill-row">
        <span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span>
        ${m.concierge ? `<span class="concierge-pill">${I.person} ${escapeHtml(m.concierge)}</span>` : ""}
      </div>

      <div class="quick-actions">
        ${QUICK_ACTIONS.map((a) => `<button type="button" class="qa-btn" data-method="${a.method}"><span class="qa-icon">${a.icon}</span>${a.label}</button>`).join("")}
      </div>
      <p class="muted qa-hint">Logs the conversation here. Doesn't dial, text, or send email.</p>

      ${m.next_follow_up ? `<div class="field"><label>Next Follow-Up</label><div class="fu-${fu}">${I.calendar} ${fmtDate(m.next_follow_up)}${fu === "overdue" ? " · Overdue" : fu === "today" ? " · Today" : ""}</div></div>` : ""}
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
      uiState.editingNoteId = null;
      uiState.composerMethod = btn.dataset.method;
      uiState.focusComposer = true;
      render();
    })
  );
}

// ---------- activity tab ----------
function renderActivityTab(interactions) {
  const filtered = uiState.methodFilter ? interactions.filter((i) => i.method === uiState.methodFilter) : interactions;
  return `
    <div id="tab-activity" class="tab-panel" style="${uiState.activeTab === "activity" ? "" : "display:none"}">
      <div class="toolbar">
        <div class="filter-chips" id="method-chips">
          <button type="button" class="chip ${!uiState.methodFilter ? "active" : ""}" data-method="">All <span class="chip-n">${interactions.length}</span></button>
          ${METHODS.map((m) => {
            const n = interactions.filter((i) => i.method === m).length;
            return `<button type="button" class="chip ${uiState.methodFilter === m ? "active" : ""}" data-method="${m}">${METHOD_ICON[m]} ${m} <span class="chip-n">${n}</span></button>`;
          }).join("")}
        </div>
        <button type="button" id="toggle-composer-btn" class="btn btn-primary">${I.plus} Log Activity</button>
      </div>

      ${uiState.composerOpen && !uiState.editingNoteId ? composerHtml(null) : ""}

      ${
        filtered.length
          ? groupBy(filtered, (i) => monthLabel(i.occurred_at))
              .map(
                ([label, items]) => `
            <div class="group-label">${escapeHtml(label)}</div>
            <div class="notes-list">
              ${items.map((i) => (uiState.editingNoteId === i.id ? composerHtml(i) : noteCardHtml(i))).join("")}
            </div>`
              )
              .join("")
          : `<div class="empty-state">${interactions.length ? "No " + uiState.methodFilter.toLowerCase() + " entries yet." : "No conversations logged yet. Use Call / Text / Email / Note on the left to add one."}</div>`
      }
    </div>
  `;
}

function noteCardHtml(i) {
  return `
    <div class="note-card">
      <div class="note-top">
        <span class="method-badge method-${slug(i.method)}">${METHOD_ICON[i.method] || ""} ${escapeHtml(i.method)}</span>
        <span class="muted">${escapeHtml(i.created_by_name || "someone")} &middot; ${fmtDateTime(i.occurred_at)}${i.edited_at ? ` &middot; <em>edited</em>` : ""}</span>
        <span class="note-actions">
          <button class="icon-btn edit-note-btn" data-id="${i.id}" title="Edit">${I.edit}</button>
          ${isAdmin() ? `<button class="icon-btn danger delete-note-btn" data-id="${i.id}" title="Delete">${I.trash}</button>` : ""}
        </span>
      </div>
      <div class="note-text">${escapeHtml(i.note)}</div>
    </div>`;
}

function composerHtml(existing) {
  const p = existing ? `e-${existing.id}-` : "c-";
  const method = dv(`${p}method`, existing ? existing.method : uiState.composerMethod);
  const when = dv(`${p}when`, toLocalInput(existing ? existing.occurred_at : new Date().toISOString()));
  const note = dv(`${p}note`, existing ? existing.note : "");
  return `
    <form class="composer" data-edit-id="${existing ? existing.id : ""}" data-prefix="${p}">
      <div class="composer-top">
        <select id="${p}method" data-draft>${METHODS.map((m) => `<option ${method === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        <input id="${p}when" data-draft type="datetime-local" value="${escapeAttr(when)}" required />
        <span class="muted composer-hint">${existing ? "Editing" : "When it happened"}</span>
      </div>
      <textarea id="${p}note" data-draft rows="3" required placeholder="What did you talk about? Any follow-up needed?">${escapeHtml(note)}</textarea>
      <div class="composer-actions">
        <button type="button" class="btn cancel-composer-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">${existing ? "Save changes" : "Log it"}</button>
      </div>
    </form>`;
}

function wireActivityTab(meister) {
  document.querySelectorAll("#method-chips .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      uiState.methodFilter = chip.dataset.method;
      render();
    })
  );

  document.getElementById("toggle-composer-btn")?.addEventListener("click", () => {
    uiState.composerOpen = true;
    uiState.editingNoteId = null;
    uiState.focusComposer = true;
    render();
  });

  document.querySelectorAll(".composer").forEach((form) => {
    const prefix = form.dataset.prefix;
    const editId = form.dataset.editId;

    form.querySelector(".cancel-composer-btn").addEventListener("click", () => {
      clearDrafts(prefix);
      if (editId) uiState.editingNoteId = null;
      else uiState.composerOpen = false;
      render();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        method: document.getElementById(`${prefix}method`).value,
        occurred_at: fromLocalInput(document.getElementById(`${prefix}when`).value),
        note: document.getElementById(`${prefix}note`).value.trim(),
      };
      if (!payload.note || !payload.occurred_at) return;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (editId) {
          await updateInteraction(editId, payload, currentProfile.full_name);
          uiState.editingNoteId = null;
          toast("Note updated");
        } else {
          await addInteraction(meister.id, payload, currentProfile.full_name, currentProfile.id);
          uiState.composerOpen = false;
          toast(`${payload.method === "Other" ? "Note" : payload.method} logged`);
        }
        clearDrafts(prefix);
        render();
      } catch (err) {
        toast("Could not save: " + err.message, "error");
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".edit-note-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      uiState.editingNoteId = btn.dataset.id;
      uiState.composerOpen = false;
      render();
    })
  );

  document.querySelectorAll(".delete-note-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this note? This cannot be undone.")) return;
      try {
        await deleteInteraction(btn.dataset.id);
        toast("Note deleted");
        render();
      } catch (err) {
        toast("Could not delete: " + err.message, "error");
      }
    })
  );
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
    render();
    document.getElementById("g-name")?.focus();
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
  return String(str || "").toLowerCase().replace(/\s+/g, "-");
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
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${fmtTime(iso)}`;
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
function followUpState(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = parseDateOnly(dateStr);
  if (d < today) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  return "upcoming";
}
function followUpChip(dateStr) {
  const s = followUpState(dateStr);
  if (!s) return `<span class="muted">—</span>`;
  const label = s === "overdue" ? "Overdue" : s === "today" ? "Today" : fmtDate(dateStr);
  return `<span class="fu-chip fu-${s}">${I.calendar} ${label}</span>${s !== "upcoming" ? `<div class="muted cell-sub">${fmtDate(dateStr)}</div>` : ""}`;
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
