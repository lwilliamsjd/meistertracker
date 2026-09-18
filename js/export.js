import { fetchAllForExport, listMeisterRollups } from "./api.js";

// Dates are written as real Excel date cells (not text) so they sort and
// filter properly in Excel.
export async function exportToExcel() {
  const XLSX = window.XLSX;
  if (!XLSX) {
    throw new Error("Excel export library did not load. Check your internet connection and try again.");
  }

  const [{ meisters, interactions, guests }, rollups] = await Promise.all([fetchAllForExport(), listMeisterRollups()]);

  const meisterRows = meisters.map((m) => {
    const r = rollups[m.id] || {};
    return {
      Name: m.name,
      Concierge: m.concierge || "",
      Status: m.status,
      "Next Follow-Up": toDate(m.next_follow_up),
      "Last Contact": toDate(r.last_contact),
      "Conversations": r.interaction_count || 0,
      "Guests": r.guest_count || 0,
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
    "Date/Time": toDate(i.occurred_at),
    Note: i.note,
    "Logged By": i.created_by_name || "",
    "Logged At": toDate(i.created_at),
    "Edited By": i.edited_by_name || "",
    "Edited At": toDate(i.edited_at),
  }));

  const guestRows = guests.map((g) => ({
    Meister: g.meisters ? g.meisters.name : "",
    "Guest Name": g.guest_name,
    "Vehicle Purchased": g.vehicle_purchased || "",
    "Purchase Date": toDate(g.purchase_date),
    Notes: g.notes || "",
    "Logged By": g.created_by_name || "",
  }));

  const wb = XLSX.utils.book_new();
  addSheet(XLSX, wb, "Meisters", meisterRows, { "Next Follow-Up": "yyyy-mm-dd", "Last Contact": "yyyy-mm-dd hh:mm", "Created At": "yyyy-mm-dd hh:mm", "Last Updated At": "yyyy-mm-dd hh:mm" });
  addSheet(XLSX, wb, "Interactions", interactionRows, { "Date/Time": "yyyy-mm-dd hh:mm", "Logged At": "yyyy-mm-dd hh:mm", "Edited At": "yyyy-mm-dd hh:mm" });
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
    // apply number formats to date columns
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
  // date-only strings (yyyy-mm-dd) should not shift by timezone
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00");
  return new Date(v);
}
