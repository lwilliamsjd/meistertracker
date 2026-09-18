import { supabase } from "./supabase-client.js";

// ---------- auth ----------
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
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) return { id: session.user.id, full_name: session.user.email, email: session.user.email };
  return data;
}

// ---------- meisters ----------
export async function listMeisters() {
  const { data, error } = await supabase
    .from("meisters")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
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
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addInteraction(meisterId, method, note, authorName, authorId) {
  const { data, error } = await supabase
    .from("interactions")
    .insert([{ meister_id: meisterId, method, note, created_by: authorId, created_by_name: authorName }])
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

export async function deleteGuest(id) {
  const { error } = await supabase.from("guests").delete().eq("id", id);
  if (error) throw error;
}

// ---------- activity feed (recent across everything) ----------
export async function listRecentActivity(limit = 100) {
  const { data, error } = await supabase
    .from("interactions")
    .select("*, meisters(name)")
    .order("created_at", { ascending: false })
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
    supabase.from("interactions").select("*, meisters(name)").order("created_at", { ascending: false }),
    supabase.from("guests").select("*, meisters(name)").order("purchase_date", { ascending: false, nullsFirst: false }),
  ]);
  if (meisters.error) throw meisters.error;
  if (interactions.error) throw interactions.error;
  if (guests.error) throw guests.error;
  return { meisters: meisters.data, interactions: interactions.data, guests: guests.data };
}
