import { fetchAllForExport, listMeisterRollups } from "./api.js";

// Dates are written as real Excel date cells (not text) so they sort and
// filter properly in Excel.
export async function exportToExcel(userId) {
  const XLSX = window.XLSX;
  if (!XLSX) {
    throw new Error("Excel export library did not load. Check your internet connection and try again.");
  }

  const [{ meisters, interactions, guests, followUps, comments, categories }, rollups] = await Promise.all([
    fetchAllForExport(),
    listMeisterRollups(userId),
  ]);

  const noteById = Object.fromEntries(interactions.map((i) => [i.id, i]));
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  // Question type summary for the client report
  const catCounts = {};
  let uncategorized = 0;
  for (const i of interactions) {
    if (i.category_id && catName[i.category_id]) catCounts[catName[i.category_id]] = (catCounts[catName[i.category_id]] || 0) + 1;
    else uncategorized++;
  }
  const categorizedTotal = interactions.length - uncategorized;
  const summaryRows = categories
    .map((c) => ({ "Question Type": c.name, Count: catCounts[c.name] || 0, "% of Categorized": categorizedTotal ? Math.round(((catCounts[c.name] || 0) / categorizedTotal) * 1000) / 10 : 0, Status: c.active ? "Active" : "Retired" }))
    .sort((a, b) => b.Count - a.Count);
  summaryRows.push({ "Question Type": "(No type selected)", Count: uncategorized, "% of Categorized": "", Status: "" });

  const meisterRows = meisters.map((m) => {
    const r = rollups[m.id] || {};
    return {
      Name: m.name,
      "Job Title": m.job_title || "",
      Concierge: m.concierge || "",
      Status: m.status,
      "Last Contact": toDate(r.last_contact),
      Conversations: r.interaction_count || 0,
      Guests: r.guest_count || 0,
      Phone: m.phone || "",
      Email: m.email || "",
      Dealership: m.dealership || "",
      "Dealership Website": m.dealership_website || "",
      City: m.city || "",
      State: m.state || "",
      Zip: m.zip || "",
      "Profile Summary": m.profile_summary || "",
      "Created By": m.created_by_name || "",
      "Created At": toDate(m.created_at),
      "Last Updated By": m.updated_by_name || "",
      "Last Updated At": toDate(m.updated_at),
    };
  });

  const interactionRows = interactions.map((i) => ({
    Meister: i.meisters ? i.meisters.name : "",
    Method: i.method,
    "Question Type": catName[i.category_id] || "",
    "Date/Time": toDate(i.occurred_at),
    Note: i.note,
    "Logged By": i.created_by_name || "",
    "Logged At": toDate(i.created_at),
    "Edited By": i.edited_by_name || "",
    "Edited At": toDate(i.edited_at),
  }));

  const commentRows = comments.map((c) => {
    const n = noteById[c.interaction_id];
    return {
      Meister: n?.meisters ? n.meisters.name : "",
      "On Activity": n ? `${n.method} — ${n.note.slice(0, 60)}` : "",
      Comment: c.body,
      By: c.created_by_name || "",
      "Date/Time": toDate(c.created_at),
      "Edited At": toDate(c.edited_at),
    };
  });

  const followUpRows = followUps.map((f) => ({
    Meister: f.meisters ? f.meisters.name : "",
    Title: f.title,
    Due: toDate(f.due_at),
    Owner: f.user_name || "",
    Status: f.done_at ? "Done" : new Date(f.due_at) < new Date() ? "Overdue" : "Pending",
    "Completed At": toDate(f.done_at),
    "Created At": toDate(f.created_at),
  }));

  const guestRows = guests.map((g) => ({
    Meister: g.meisters ? g.meisters.name : "",
    "Guest Name": g.guest_name,
    "Vehicle Purchased": g.vehicle_purchased || "",
    "Purchase Date": toDate(g.purchase_date),
    Notes: g.notes || "",
    "Logged By": g.created_by_name || "",
  }));

  const DT = "yyyy-mm-dd hh:mm";
  const wb = XLSX.utils.book_new();
  addSheet(XLSX, wb, "Question Types", summaryRows, {});
  addSheet(XLSX, wb, "Meisters", meisterRows, { "Last Contact": DT, "Created At": DT, "Last Updated At": DT });
  addSheet(XLSX, wb, "Interactions", interactionRows, { "Date/Time": DT, "Logged At": DT, "Edited At": DT });
  addSheet(XLSX, wb, "Comments", commentRows, { "Date/Time": DT, "Edited At": DT });
  addSheet(XLSX, wb, "Follow-Ups", followUpRows, { Due: DT, "Completed At": DT, "Created At": DT });
  addSheet(XLSX, wb, "Guests", guestRows, { "Purchase Date": "yyyy-mm-dd" });

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `GR-GT-CRM-Export-${stamp}.xlsx`, { cellDates: true });
}

function addSheet(XLSX, wb, name, rows, dateFormats) {
  const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
  if (rows.length) {
    const cols = Object.keys(rows[0]);
    ws["!cols"] = cols.map((c) => {
      const maxLen = Math.max(c.length, ...rows.map((r) => String(r[c] instanceof Date ? "0000-00-00 00:00" : r[c] ?? "").length));
      return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
    });
    const range = XLSX.utils.decode_range(ws["!ref"]);
    cols.forEach((c, ci) => {
      const fmt = dateFormats[c];
      if (!fmt) return;
      for (let r = 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
        if (cell && cell.t === "d") cell.z = fmt;
      }
    });
    ws["!autofilter"] = { ref: ws["!ref"] };
  }
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function toDate(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00");
  return new Date(v);
}
