import { supabase } from "./supabase-client.js";

// ---------- auth / account ----------
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_admin")
    .eq("id", session.user.id)
    .single();
  if (error) {
    return { id: session.user.id, full_name: session.user.email, email: session.user.email, is_admin: false };
  }
  return data;
}

export async function listTeam() {
  const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
  if (error) throw error;
  return data;
}

export async function setDisplayName(newName) {
  const { error } = await supabase.rpc("set_display_name", { new_name: newName });
  if (error) throw error;
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ---------- meisters ----------
export async function listMeisters() {
  const { data, error } = await supabase.from("meisters").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Lightweight per-meister rollups for the dashboard (last contact, counts).
export async function listMeisterRollups() {
  const [ints, gs] = await Promise.all([
    supabase.from("interactions").select("meister_id, occurred_at"),
    supabase.from("guests").select("meister_id"),
  ]);
  if (ints.error) throw ints.error;
  if (gs.error) throw gs.error;

  const rollup = {};
  for (const i of ints.data) {
    const r = (rollup[i.meister_id] ||= { last_contact: null, interaction_count: 0, guest_count: 0 });
    r.interaction_count += 1;
    if (!r.last_contact || i.occurred_at > r.last_contact) r.last_contact = i.occurred_at;
  }
  for (const g of gs.data) {
    const r = (rollup[g.meister_id] ||= { last_contact: null, interaction_count: 0, guest_count: 0 });
    r.guest_count += 1;
  }
  return rollup;
}

export async function getMeister(id) {
  const { data, error } = await supabase.from("meisters").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createMeister(fields, authorName, authorId) {
  const { data, error } = await supabase
    .from("meisters")
    .insert([{ ...fields, created_by: authorId, created_by_name: authorName, updated_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMeister(id, fields, authorName) {
  const { data, error } = await supabase
    .from("meisters")
    .update({ ...fields, updated_by_name: authorName })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMeister(id) {
  const { error } = await supabase.from("meisters").delete().eq("id", id);
  if (error) throw error;
}

// ---------- interactions ----------
export async function listInteractions(meisterId) {
  const { data, error } = await supabase
    .from("interactions")
    .select("*")
    .eq("meister_id", meisterId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addInteraction(meisterId, { method, note, occurred_at }, authorName, authorId) {
  const { data, error } = await supabase
    .from("interactions")
    .insert([{ meister_id: meisterId, method, note, occurred_at, created_by: authorId, created_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInteraction(id, { method, note, occurred_at }, editorName) {
  const { data, error } = await supabase
    .from("interactions")
    .update({ method, note, occurred_at, edited_at: new Date().toISOString(), edited_by_name: editorName })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInteraction(id) {
  const { error } = await supabase.from("interactions").delete().eq("id", id);
  if (error) throw error;
}

// ---------- guests ----------
export async function listGuests(meisterId) {
  const { data, error } = await supabase
    .from("guests")
    .select("*")
    .eq("meister_id", meisterId)
    .order("purchase_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function addGuest(meisterId, fields, authorName, authorId) {
  const { data, error } = await supabase
    .from("guests")
    .insert([{ meister_id: meisterId, ...fields, created_by: authorId, created_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGuest(id, fields) {
  const { data, error } = await supabase.from("guests").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGuest(id) {
  const { error } = await supabase.from("guests").delete().eq("id", id);
  if (error) throw error;
}

// ---------- activity feed (recent across everything) ----------
export async function listRecentActivity(limit = 300) {
  const { data, error } = await supabase
    .from("interactions")
    .select("*, meisters(name, concierge)")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ---------- realtime ----------
export function subscribeToChanges(onChange) {
  const channel = supabase
    .channel("crm-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "meisters" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "interactions" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "guests" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---------- export helper ----------
export async function fetchAllForExport() {
  const [meisters, interactions, guests] = await Promise.all([
    supabase.from("meisters").select("*").order("name"),
    supabase.from("interactions").select("*, meisters(name)").order("occurred_at", { ascending: false }),
    supabase.from("guests").select("*, meisters(name)").order("purchase_date", { ascending: false, nullsFirst: false }),
  ]);
  if (meisters.error) throw meisters.error;
  if (interactions.error) throw interactions.error;
  if (guests.error) throw guests.error;
  return { meisters: meisters.data, interactions: interactions.data, guests: guests.data };
}
