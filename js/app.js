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
  listGuests,
  addGuest,
  deleteGuest,
  listRecentActivity,
  subscribeToChanges,
} from "./api.js";
import { exportToExcel } from "./export.js";

const app = document.getElementById("app");
let currentProfile = null;
let unsubscribeRealtime = null;

const QUICK_ACTIONS = [
  { label: "Call", icon: "\u{1F4DE}", method: "Phone" },
  { label: "Text", icon: "\u{1F4AC}", method: "Text" },
  { label: "Email", icon: "✉️", method: "Email" },
  { label: "Note", icon: "\u{1F4DD}", method: "Other" },
];

// per-meister-view UI state (reset each time renderMeister runs for a new id)
let uiState = { activeTab: "profile", composerOpen: false, composerMethod: "Phone", methodFilter: "", guestFormOpen: false };

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
      // Supabase re-fires SIGNED_IN on tab-focus / token refresh even when
      // already logged in — only treat it as a real login (and navigate
      // away) if we're actually sitting on the login screen. Otherwise this
      // was wiping out in-progress work like a half-filled "New Meister" form.
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
let lastMeisterId = null;

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
  if (route.name === "meister") {
    const id = route.mode === "new" ? "new" : route.id;
    if (id !== lastMeisterId) {
      uiState = {
        activeTab: route.mode === "new" ? "profile" : "activity",
        composerOpen: false,
        composerMethod: "Phone",
        methodFilter: "",
        guestFormOpen: false,
      };
      lastMeisterId = id;
    }
    return renderShell(() => renderMeister(route));
  }
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
        <td>${escapeHtml(formatPhone(m.phone) || "—")}</td>
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
  let guests = [];

  if (!isNew) {
    container.innerHTML = `<div class="loading">Loading meister…</div>`;
    try {
      [meister, interactions, guests] = await Promise.all([
        getMeister(route.id),
        listInteractions(route.id),
        listGuests(route.id),
      ]);
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

    <div class="${isNew ? "" : "meister-layout"}">
      ${!isNew ? renderProfileSidebar(meister) : ""}
      <div>
    <div class="tabs" id="tabs">
      ${!isNew ? `<button class="tab-btn ${uiState.activeTab === "activity" ? "active" : ""}" data-tab="activity">Activity (${interactions.length})</button>` : ""}
      ${!isNew ? `<button class="tab-btn ${uiState.activeTab === "guests" ? "active" : ""}" data-tab="guests">Guests (${guests.length})</button>` : ""}
      <button class="tab-btn ${uiState.activeTab === "profile" ? "active" : ""}" data-tab="profile">${isNew ? "" : "Edit "}Profile</button>
    </div>

    <div id="tab-profile" class="tab-panel" style="${uiState.activeTab === "profile" ? "" : "display:none"}">
      <form id="profile-form" class="form-card">
        <div class="form-grid">
          <div class="form-field">
            <label>Name *</label>
            <input id="f-name" required value="${escapeAttr(meister?.name)}" />
          </div>
          <div class="form-field">
            <label>Status</label>
            <select id="f-status">
              ${["New", "Contacted", "Engaged", "Sold", "Not Interested"]
                .map((s) => `<option ${meister?.status === s ? "selected" : ""}>${s}</option>`)
                .join("")}
            </select>
          </div>
          <div class="form-field">
            <label>Phone</label>
            <input id="f-phone" type="tel" placeholder="(xxx) xxx-xxxx" value="${escapeAttr(formatPhone(meister?.phone))}" />
          </div>
          <div class="form-field">
            <label>Email</label>
            <input id="f-email" type="email" value="${escapeAttr(meister?.email)}" />
          </div>
          <div class="form-field">
            <label>Dealership</label>
            <input id="f-dealership" value="${escapeAttr(meister?.dealership)}" />
          </div>
          <div class="form-field">
            <label>Dealership Website</label>
            <input id="f-dealership-website" placeholder="https://…" value="${escapeAttr(meister?.dealership_website)}" />
          </div>
          <div class="form-field">
            <label>City</label>
            <input id="f-city" value="${escapeAttr(meister?.city)}" />
          </div>
          <div class="form-field form-field-split">
            <div>
              <label>State</label>
              <input id="f-state" value="${escapeAttr(meister?.state)}" />
            </div>
            <div>
              <label>Zip</label>
              <input id="f-zip" value="${escapeAttr(meister?.zip)}" />
            </div>
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

    ${!isNew ? renderActivityTab(interactions) : ""}
    ${!isNew ? renderGuestsTab(guests) : ""}
      </div>
    </div>
  `;

  wireTabs();

  const phoneInput = document.getElementById("f-phone");
  phoneInput.addEventListener("input", () => {
    const cursorAtEnd = phoneInput.selectionEnd === phoneInput.value.length;
    phoneInput.value = formatPhone(phoneInput.value);
    if (cursorAtEnd) phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
  });

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = {
      name: document.getElementById("f-name").value.trim(),
      dealership: document.getElementById("f-dealership").value.trim(),
      dealership_website: document.getElementById("f-dealership-website").value.trim(),
      city: document.getElementById("f-city").value.trim(),
      state: document.getElementById("f-state").value.trim(),
      zip: document.getElementById("f-zip").value.trim(),
      phone: formatPhone(document.getElementById("f-phone").value),
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
      if (!confirm(`Delete ${meister.name}? This also deletes all their logged conversations and guests.`)) return;
      await deleteMeister(meister.id);
      navigate("#/dashboard");
    });

    wireQuickActions();
    wireActivityTab(route, meister);
    wireGuestsTab(route, meister);
  }
}

// ---------- profile sidebar ----------
function renderProfileSidebar(meister) {
  const cityLine = [meister.city, [meister.state, meister.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `
    <div class="card profile-sidebar">
      <div class="avatar">${initials(meister.name)}</div>
      <div class="mname">${escapeHtml(meister.name)}</div>
      ${meister.dealership ? `<div class="mrole">${escapeHtml(meister.dealership)}</div>` : ""}
      <span class="status-pill status-${slug(meister.status)}">${escapeHtml(meister.status)}</span>

      <div class="quick-actions">
        ${QUICK_ACTIONS.map(
          (a) => `<button type="button" class="qa-btn" data-method="${a.method}"><span class="qa-icon">${a.icon}</span>${a.label}</button>`
        ).join("")}
      </div>
      <p class="muted" style="margin:-4px 0 16px">Logs the conversation here — doesn't place a call, send a text, or send an email.</p>

      ${meister.phone ? `<div class="field"><label>Phone</label><div>${escapeHtml(formatPhone(meister.phone))}</div></div>` : ""}
      ${meister.email ? `<div class="field"><label>Email</label><div>${escapeHtml(meister.email)}</div></div>` : ""}
      ${meister.dealership_website ? `<div class="field"><label>Dealership Website</label><div><a href="${escapeAttr(withProtocol(meister.dealership_website))}" target="_blank" rel="noopener">${escapeHtml(meister.dealership_website)}</a></div></div>` : ""}
      ${cityLine ? `<div class="field"><label>Location</label><div>${escapeHtml(cityLine)}</div></div>` : ""}
      ${meister.profile_summary ? `<div class="field"><label>Profile Summary</label><div class="muted" style="font-size:13px">${escapeHtml(meister.profile_summary)}</div></div>` : ""}
    </div>
  `;
}

function initials(name) {
  return (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function formatPhone(value) {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function withProtocol(url) {
  if (!url) return "#";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function wireQuickActions() {
  document.querySelectorAll(".qa-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiState.activeTab = "activity";
      uiState.composerOpen = true;
      uiState.composerMethod = btn.dataset.method;
      render();
    });
  });
}

// ---------- activity tab ----------
const METHODS = ["Phone", "Text", "Email", "In Person", "Other"];

function renderActivityTab(interactions) {
  const filtered = uiState.methodFilter ? interactions.filter((i) => i.method === uiState.methodFilter) : interactions;

  return `
    <div id="tab-activity" class="tab-panel" style="${uiState.activeTab === "activity" ? "" : "display:none"}">
      <div class="toolbar">
        <div class="filter-chips" id="method-chips">
          <button type="button" class="chip ${!uiState.methodFilter ? "active" : ""}" data-method="">All (${interactions.length})</button>
          ${METHODS.map((m) => {
            const count = interactions.filter((i) => i.method === m).length;
            return `<button type="button" class="chip ${uiState.methodFilter === m ? "active" : ""}" data-method="${m}">${m} (${count})</button>`;
          }).join("")}
        </div>
        <button type="button" id="toggle-composer-btn" class="btn btn-primary">${uiState.composerOpen ? "Cancel" : "+ Log Activity"}</button>
      </div>

      ${
        uiState.composerOpen
          ? `
      <form id="interaction-form" class="composer">
        <div class="composer-top">
          <select id="i-method">
            ${METHODS.map((m) => `<option ${uiState.composerMethod === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
        <textarea id="i-note" rows="3" required placeholder="What did you talk about? Any follow-up needed?"></textarea>
        <div class="composer-actions">
          <button type="button" id="cancel-composer-btn" class="btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>`
          : ""
      }

      <div class="notes-list">
        ${
          filtered.length
            ? filtered
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

function wireActivityTab(route, meister) {
  const chipsEl = document.getElementById("method-chips");
  if (chipsEl) {
    chipsEl.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        uiState.methodFilter = chip.dataset.method;
        render();
      });
    });
  }

  const toggleBtn = document.getElementById("toggle-composer-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      uiState.composerOpen = !uiState.composerOpen;
      render();
    });
  }
  const cancelBtn = document.getElementById("cancel-composer-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      uiState.composerOpen = false;
      render();
    });
  }

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
        uiState.composerOpen = false;
        render();
      } catch (err) {
        alert("Could not save note: " + err.message);
        btn.disabled = false;
      }
    });
  }

  document.querySelectorAll(".delete-note-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this note?")) return;
      await deleteInteraction(btn.dataset.id);
      render();
    });
  });
}

// ---------- guests tab ----------
function renderGuestsTab(guests) {
  return `
    <div id="tab-guests" class="tab-panel" style="${uiState.activeTab === "guests" ? "" : "display:none"}">
      <div class="table-wrap" style="margin-bottom:16px">
        <table class="crm-table">
          <thead>
            <tr><th>Guest Name</th><th>Vehicle Purchased</th><th>Purchase Date</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            ${
              guests.length
                ? guests
                    .map(
                      (g) => `
              <tr>
                <td class="cell-name">${escapeHtml(g.guest_name)}</td>
                <td>${escapeHtml(g.vehicle_purchased || "—")}</td>
                <td>${g.purchase_date ? new Date(g.purchase_date + "T00:00:00").toLocaleDateString() : "—"}</td>
                <td>${escapeHtml(g.notes || "—")}</td>
                <td><button class="delete-note-btn delete-guest-btn" data-id="${g.id}" title="Delete guest">&times;</button></td>
              </tr>`
                    )
                    .join("")
                : `<tr><td colspan="5"><div class="empty-state">No guests logged yet.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>

      ${
        uiState.guestFormOpen
          ? `
      <form id="guest-form" class="form-card">
        <div class="form-grid">
          <div class="form-field">
            <label>Guest Name *</label>
            <input id="g-name" required />
          </div>
          <div class="form-field">
            <label>Vehicle Purchased</label>
            <input id="g-vehicle" placeholder="e.g. GR GT" />
          </div>
          <div class="form-field">
            <label>Purchase Date</label>
            <input id="g-date" type="date" />
          </div>
          <div class="form-field">
            <label>Notes</label>
            <input id="g-notes" />
          </div>
        </div>
        <div class="composer-actions">
          <button type="button" id="cancel-guest-btn" class="btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Guest</button>
        </div>
      </form>`
          : `<div class="add-guest-btn" id="add-guest-btn">+ Add Guest</div>`
      }
    </div>
  `;
}

function wireGuestsTab(route, meister) {
  const addBtn = document.getElementById("add-guest-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      uiState.guestFormOpen = true;
      render();
    });
  }
  const cancelBtn = document.getElementById("cancel-guest-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      uiState.guestFormOpen = false;
      render();
    });
  }
  const guestForm = document.getElementById("guest-form");
  if (guestForm) {
    guestForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fields = {
        guest_name: document.getElementById("g-name").value.trim(),
        vehicle_purchased: document.getElementById("g-vehicle").value.trim(),
        purchase_date: document.getElementById("g-date").value || null,
        notes: document.getElementById("g-notes").value.trim(),
      };
      if (!fields.guest_name) return;
      const btn = guestForm.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        await addGuest(meister.id, fields, currentProfile.full_name, currentProfile.id);
        uiState.guestFormOpen = false;
        render();
      } catch (err) {
        alert("Could not save guest: " + err.message);
        btn.disabled = false;
      }
    });
  }

  document.querySelectorAll(".delete-guest-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this guest record?")) return;
      await deleteGuest(btn.dataset.id);
      render();
    });
  });
}

function wireTabs() {
  const tabsEl = document.getElementById("tabs");
  if (!tabsEl) return;
  tabsEl.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiState.activeTab = btn.dataset.tab;
      render();
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
