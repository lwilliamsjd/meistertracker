import { supabase } from "./supabase-client.js";
import {
  signIn,
  signOut,
  getSession,
  getCurrentProfile,
  listMeisters,
  getMeister,
  createMeister,
  updateMeister,
  deleteMeister,
  listInteractions,
  addInteraction,
  deleteInteraction,
  listRecentActivity,
  subscribeToChanges,
} from "./api.js";
import { exportToExcel } from "./export.js";

const app = document.getElementById("app");
let currentProfile = null;
let unsubscribeRealtime = null;

// ============================================================
// ROUTER  (hash-based — works with GitHub Pages + browser back/forward)
// ============================================================
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", init);

async function init() {
  const session = await getSession();
  if (session) {
    currentProfile = await getCurrentProfile();
    startRealtime();
  }
  render();

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN") {
      currentProfile = await getCurrentProfile();
      startRealtime();
      navigate("#/dashboard");
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
    // Only re-render list/detail-style views live; don't yank someone
    // out of a form they're typing in.
    const route = parseHash();
    if (route.name === "dashboard" || route.name === "activity") render();
    if (route.name === "meister" && route.mode === "view") render();
  });
}

function navigate(hash) {
  if (window.location.hash === hash) {
    render();
  } else {
    window.location.hash = hash;
  }
}
window.navigate = navigate;

function parseHash() {
  const hash = window.location.hash || "#/dashboard";
  const parts = hash.replace(/^#\//, "").split("/");
  if (parts[0] === "" || parts[0] === "dashboard") return { name: "dashboard" };
  if (parts[0] === "login") return { name: "login" };
  if (parts[0] === "activity") return { name: "activity" };
  if (parts[0] === "meister" && parts[1] === "new") return { name: "meister", mode: "new" };
  if (parts[0] === "meister" && parts[1]) return { name: "meister", mode: "view", id: parts[1] };
  return { name: "dashboard" };
}

// ============================================================
// RENDER
// ============================================================
async function render() {
  const session = await getSession();
  const route = parseHash();

  if (!session && route.name !== "login") {
    window.location.hash = "#/login";
    return;
  }
  if (session && route.name === "login") {
    window.location.hash = "#/dashboard";
    return;
  }

  if (route.name === "login") return renderLogin();
  if (route.name === "dashboard") return renderShell(renderDashboard);
  if (route.name === "activity") return renderShell(renderActivity);
  if (route.name === "meister") return renderShell(() => renderMeister(route));
}

function renderShell(contentFn) {
  const route = parseHash();
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-dot"></span>
          <span>GR GT Concierge CRM</span>
        </div>
        <nav class="nav">
          <a href="#/dashboard" class="${route.name === "dashboard" ? "active" : ""}">Meisters</a>
          <a href="#/activity" class="${route.name === "activity" ? "active" : ""}">Activity Log</a>
        </nav>
        <div class="user-area">
          <span class="user-name">${escapeHtml(currentProfile?.full_name || "")}</span>
          <button id="logout-btn" class="btn btn-ghost">Log Out</button>
        </div>
      </header>
      <main id="main-content" class="main-content"></main>
    </div>
  `;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await signOut();
  });
  contentFn(document.getElementById("main-content"));
}

// ============================================================
// LOGIN VIEW
// ============================================================
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <form id="login-form" class="login-card">
        <div class="brand brand-lg">
          <span class="brand-dot"></span>
          <span>GR GT Concierge CRM</span>
        </div>
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
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    const { error } = await signIn(email, password);
    if (error) errorEl.textContent = error.message;
  });
}

// ============================================================
// DASHBOARD VIEW
// ============================================================
async function renderDashboard(container) {
  container.innerHTML = `<div class="loading">Loading meisters…</div>`;
  const meisters = await listMeisters();

  container.innerHTML = `
    <div class="page-header">
      <h1>Meisters</h1>
      <div class="page-actions">
        <button id="export-btn" class="btn btn-ghost">Export to Excel</button>
        <button id="new-meister-btn" class="btn btn-primary">+ Add Meister</button>
      </div>
    </div>
    <div class="filters">
      <input id="search-input" type="text" placeholder="Search by name, dealership, phone, email…" />
      <select id="status-filter">
        <option value="">All Statuses</option>
        <option>New</option>
        <option>Contacted</option>
        <option>Engaged</option>
        <option>Sold</option>
        <option>Not Interested</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Dealership</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Status</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody id="meister-rows"></tbody>
      </table>
      <div id="empty-state" class="empty-state" style="display:none">No meisters match your filters yet.</div>
    </div>
  `;

  document.getElementById("new-meister-btn").addEventListener("click", () => navigate("#/meister/new"));
  document.getElementById("export-btn").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Exporting…";
    try {
      await exportToExcel();
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      e.target.disabled = false;
      e.target.textContent = "Export to Excel";
    }
  });

  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");
  const draw = () => drawMeisterRows(meisters, searchInput.value, statusFilter.value);
  searchInput.addEventListener("input", draw);
  statusFilter.addEventListener("change", draw);
  draw();
}

function drawMeisterRows(meisters, query, status) {
  const q = (query || "").toLowerCase().trim();
  const filtered = meisters.filter((m) => {
    const matchesQuery =
      !q ||
      [m.name, m.dealership, m.phone, m.email].some((f) => (f || "").toLowerCase().includes(q));
    const matchesStatus = !status || m.status === status;
    return matchesQuery && matchesStatus;
  });

  const tbody = document.getElementById("meister-rows");
  const emptyState = document.getElementById("empty-state");
  if (!filtered.length) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";
  tbody.innerHTML = filtered
    .map(
      (m) => `
      <tr class="clickable-row" data-id="${m.id}">
        <td class="cell-name">${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.dealership || "—")}</td>
        <td>${escapeHtml(m.phone || "—")}</td>
        <td>${escapeHtml(m.email || "—")}</td>
        <td><span class="status-pill status-${slug(m.status)}">${escapeHtml(m.status)}</span></td>
        <td class="muted">${relativeTime(m.updated_at)}</td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".clickable-row").forEach((row) => {
    row.addEventListener("click", () => navigate(`#/meister/${row.dataset.id}`));
  });
}

// ============================================================
// ACTIVITY LOG VIEW
// ============================================================
async function renderActivity(container) {
  container.innerHTML = `<div class="loading">Loading activity…</div>`;
  const activity = await listRecentActivity(150);

  if (!activity.length) {
    container.innerHTML = `
      <div class="page-header"><h1>Activity Log</h1></div>
      <div class="empty-state">No activity logged yet. Notes your team adds will show up here.</div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-header"><h1>Activity Log</h1></div>
    <p class="muted" style="margin-bottom:16px">Every conversation your team has logged, most recent first.</p>
    <div class="activity-feed">
      ${activity
        .map(
          (a) => `
        <div class="activity-item">
          <span class="method-badge method-${slug(a.method)}">${escapeHtml(a.method)}</span>
          <div class="activity-body">
            <div class="activity-top">
              <a href="#/meister/${a.meister_id}" class="activity-meister">${escapeHtml(a.meisters?.name || "Unknown Meister")}</a>
              <span class="muted">— logged by ${escapeHtml(a.created_by_name || "someone")}</span>
              <span class="muted activity-time">${relativeTime(a.created_at)}</span>
            </div>
            <div class="activity-note">${escapeHtml(a.note)}</div>
          </div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

// ============================================================
// MEISTER DETAIL / NEW VIEW
// ============================================================
async function renderMeister(route) {
  const container = document.getElementById("main-content");
  const isNew = route.mode === "new";
  let meister = null;
  let interactions = [];

  if (!isNew) {
    container.innerHTML = `<div class="loading">Loading meister…</div>`;
    try {
      [meister, interactions] = await Promise.all([getMeister(route.id), listInteractions(route.id)]);
    } catch (err) {
      container.innerHTML = `<div class="empty-state">Could not load this meister. They may have been removed.</div>`;
      return;
    }
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <a href="#/dashboard" class="back-link">&larr; Back to Meisters</a>
        <h1>${isNew ? "New Meister" : escapeHtml(meister.name)}</h1>
      </div>
      ${!isNew ? `<button id="delete-btn" class="btn btn-danger">Delete</button>` : ""}
    </div>

    <div class="tabs" id="tabs">
      <button class="tab-btn active" data-tab="profile">Profile</button>
      ${!isNew ? `<button class="tab-btn" data-tab="notes">Conversations (${interactions.length})</button>` : ""}
    </div>

    <div id="tab-profile" class="tab-panel">
      <form id="profile-form" class="form-card">
        <div class="form-grid">
          <div class="form-field">
            <label>Name *</label>
            <input id="f-name" required value="${escapeAttr(meister?.name)}" />
          </div>
          <div class="form-field">
            <label>Dealership</label>
            <input id="f-dealership" value="${escapeAttr(meister?.dealership)}" />
          </div>
          <div class="form-field">
            <label>Phone</label>
            <input id="f-phone" value="${escapeAttr(meister?.phone)}" />
          </div>
          <div class="form-field">
            <label>Email</label>
            <input id="f-email" type="email" value="${escapeAttr(meister?.email)}" />
          </div>
          <div class="form-field">
            <label>Status</label>
            <select id="f-status">
              ${["New", "Contacted", "Engaged", "Sold", "Not Interested"]
                .map((s) => `<option ${meister?.status === s ? "selected" : ""}>${s}</option>`)
                .join("")}
            </select>
          </div>
        </div>
        <div class="form-field">
          <label>Profile Summary</label>
          <textarea id="f-summary" rows="4" placeholder="Quick summary of who they are, their interest level, what matters to them...">${escapeHtml(meister?.profile_summary || "")}</textarea>
        </div>
        <div class="form-meta muted">
          ${
            isNew
              ? ""
              : `Created by ${escapeHtml(meister.created_by_name || "—")} on ${new Date(meister.created_at).toLocaleDateString()} &middot; Last updated by ${escapeHtml(meister.updated_by_name || "—")} ${relativeTime(meister.updated_at)}`
          }
        </div>
        <button type="submit" class="btn btn-primary">${isNew ? "Create Meister" : "Save Changes"}</button>
      </form>
    </div>

    ${!isNew ? renderNotesTab(interactions) : ""}
  `;

  wireTabs();

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = {
      name: document.getElementById("f-name").value.trim(),
      dealership: document.getElementById("f-dealership").value.trim(),
      phone: document.getElementById("f-phone").value.trim(),
      email: document.getElementById("f-email").value.trim(),
      status: document.getElementById("f-status").value,
      profile_summary: document.getElementById("f-summary").value.trim(),
    };
    if (!fields.name) return;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (isNew) {
        const created = await createMeister(fields, currentProfile.full_name, currentProfile.id);
        navigate(`#/meister/${created.id}`);
      } else {
        await updateMeister(meister.id, fields, currentProfile.full_name);
        render();
      }
    } catch (err) {
      alert("Could not save: " + err.message);
      btn.disabled = false;
    }
  });

  if (!isNew) {
    document.getElementById("delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete ${meister.name}? This also deletes all their logged conversations.`)) return;
      await deleteMeister(meister.id);
      navigate("#/dashboard");
    });

    const addForm = document.getElementById("interaction-form");
    if (addForm) {
      addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const method = document.getElementById("i-method").value;
        const note = document.getElementById("i-note").value.trim();
        if (!note) return;
        const btn = addForm.querySelector("button[type=submit]");
        btn.disabled = true;
        try {
          await addInteraction(meister.id, method, note, currentProfile.full_name, currentProfile.id);
          renderMeister(route);
        } catch (err) {
          alert("Could not save note: " + err.message);
          btn.disabled = false;
        }
      });
    }

    container.querySelectorAll(".delete-note-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this note?")) return;
        await deleteInteraction(btn.dataset.id);
        renderMeister(route);
      });
    });
  }
}

function renderNotesTab(interactions) {
  return `
    <div id="tab-notes" class="tab-panel" style="display:none">
      <form id="interaction-form" class="form-card">
        <div class="form-grid form-grid-tight">
          <div class="form-field">
            <label>Method</label>
            <select id="i-method">
              <option>Phone</option>
              <option>Text</option>
              <option>Email</option>
              <option>In Person</option>
              <option>Other</option>
            </select>
          </div>
        </div>
        <div class="form-field">
          <label>Note</label>
          <textarea id="i-note" rows="3" required placeholder="What did you talk about? Any follow-up needed?"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Log Conversation</button>
      </form>

      <div class="notes-list">
        ${
          interactions.length
            ? interactions
                .map(
                  (i) => `
          <div class="note-card">
            <div class="note-top">
              <span class="method-badge method-${slug(i.method)}">${escapeHtml(i.method)}</span>
              <span class="muted">${escapeHtml(i.created_by_name || "someone")} &middot; ${relativeTime(i.created_at)}</span>
              <button class="delete-note-btn" data-id="${i.id}" title="Delete note">&times;</button>
            </div>
            <div class="note-text">${escapeHtml(i.note)}</div>
          </div>`
                )
                .join("")
            : `<div class="empty-state">No conversations logged yet.</div>`
        }
      </div>
    </div>
  `;
}

function wireTabs() {
  const tabsEl = document.getElementById("tabs");
  if (!tabsEl) return;
  tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => (p.style.display = "none"));
      document.getElementById(`tab-${btn.dataset.tab}`).style.display = "block";
    });
  });
}

// ============================================================
// UTIL
// ============================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(str) {
  return escapeHtml(str || "");
}
function slug(str) {
  return String(str || "").toLowerCase().replace(/\s+/g, "-");
}
function relativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
