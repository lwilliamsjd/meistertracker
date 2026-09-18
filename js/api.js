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

// Lightweight per-meister rollups for the dashboard (last contact, counts,
// and the signed-in user's own next pending follow-up).
export async function listMeisterRollups(userId) {
  const [ints, gs, fus] = await Promise.all([
    supabase.from("interactions").select("meister_id, occurred_at"),
    supabase.from("guests").select("meister_id"),
    supabase.from("follow_ups").select("id, meister_id, title, due_at").eq("user_id", userId).is("done_at", null),
  ]);
  if (ints.error) throw ints.error;
  if (gs.error) throw gs.error;
  if (fus.error) throw fus.error;

  const blank = () => ({ last_contact: null, interaction_count: 0, guest_count: 0, my_follow_up: null });
  const rollup = {};
  for (const i of ints.data) {
    const r = (rollup[i.meister_id] ||= blank());
    r.interaction_count += 1;
    if (!r.last_contact || i.occurred_at > r.last_contact) r.last_contact = i.occurred_at;
  }
  for (const g of gs.data) (rollup[g.meister_id] ||= blank()).guest_count += 1;
  for (const f of fus.data) {
    const r = (rollup[f.meister_id] ||= blank());
    if (!r.my_follow_up || f.due_at < r.my_follow_up.due_at) r.my_follow_up = f;
  }
  return rollup;
}

// ---------- follow-ups ----------
export async function listFollowUpsForMeister(meisterId) {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*")
    .eq("meister_id", meisterId)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listMyFollowUps(userId) {
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*, meisters(name)")
    .eq("user_id", userId)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function countMyDueFollowUps(userId) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const { count, error } = await supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("done_at", null)
    .lte("due_at", endOfToday.toISOString());
  if (error) return 0;
  return count || 0;
}

export async function addFollowUp({ meister_id, interaction_id = null, title, due_at }, userName, userId) {
  const { data, error } = await supabase
    .from("follow_ups")
    .insert([{ meister_id, interaction_id, title, due_at, user_id: userId, user_name: userName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFollowUp(id, fields) {
  const { data, error } = await supabase.from("follow_ups").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFollowUp(id) {
  const { error } = await supabase.from("follow_ups").delete().eq("id", id);
  if (error) throw error;
}

// ---------- comments ----------
export async function listCommentsForInteractions(interactionIds) {
  if (!interactionIds.length) return [];
  const { data, error } = await supabase
    .from("interaction_comments")
    .select("*")
    .in("interaction_id", interactionIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listCommentCounts() {
  const { data, error } = await supabase.from("interaction_comments").select("interaction_id");
  if (error) throw error;
  const counts = {};
  for (const c of data) counts[c.interaction_id] = (counts[c.interaction_id] || 0) + 1;
  return counts;
}

export async function addComment(interactionId, body, authorName, authorId) {
  const { data, error } = await supabase
    .from("interaction_comments")
    .insert([{ interaction_id: interactionId, body, created_by: authorId, created_by_name: authorName }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateComment(id, body) {
  const { data, error } = await supabase
    .from("interaction_comments")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from("interaction_comments").delete().eq("id", id);
  if (error) throw error;
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
    .on("postgres_changes", { event: "*", schema: "public", table: "follow_ups" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "interaction_comments" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---------- export helper ----------
export async function fetchAllForExport() {
  const [meisters, interactions, guests, followUps, comments] = await Promise.all([
    supabase.from("meisters").select("*").order("name"),
    supabase.from("interactions").select("*, meisters(name)").order("occurred_at", { ascending: false }),
    supabase.from("guests").select("*, meisters(name)").order("purchase_date", { ascending: false, nullsFirst: false }),
    supabase.from("follow_ups").select("*, meisters(name)").order("due_at", { ascending: true }),
    supabase.from("interaction_comments").select("*").order("created_at", { ascending: true }),
  ]);
  for (const r of [meisters, interactions, guests, followUps, comments]) if (r.error) throw r.error;
  return { meisters: meisters.data, interactions: interactions.data, guests: guests.data, followUps: followUps.data, comments: comments.data };
}
