import { fetchAllForExport } from "./api.js";

export async function exportToExcel() {
  const XLSX = window.XLSX;
  if (!XLSX) {
    alert("Excel export library did not load. Check your internet connection and try again.");
    return;
  }

  const { meisters, interactions } = await fetchAllForExport();

  const meisterRows = meisters.map((m) => ({
    Name: m.name,
    Phone: m.phone || "",
    Email: m.email || "",
    Dealership: m.dealership || "",
    Status: m.status,
    "Profile Summary": m.profile_summary || "",
    "Created By": m.created_by_name || "",
    "Created At": formatDate(m.created_at),
    "Last Updated By": m.updated_by_name || "",
    "Last Updated At": formatDate(m.updated_at),
  }));

  const interactionRows = interactions.map((i) => ({
    Meister: i.meisters ? i.meisters.name : "",
    Method: i.method,
    Note: i.note,
    "Logged By": i.created_by_name || "",
    "Date/Time": formatDate(i.created_at),
  }));

  const wb = XLSX.utils.book_new();
  const wsMeisters = XLSX.utils.json_to_sheet(meisterRows);
  const wsInteractions = XLSX.utils.json_to_sheet(interactionRows);

  autoWidth(wsMeisters, meisterRows);
  autoWidth(wsInteractions, interactionRows);

  XLSX.utils.book_append_sheet(wb, wsMeisters, "Meisters");
  XLSX.utils.book_append_sheet(wb, wsInteractions, "Interactions");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `GR-GT-CRM-Export-${stamp}.xlsx`);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

function autoWidth(ws, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  ws["!cols"] = cols.map((c) => {
    const maxLen = Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length));
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
}
