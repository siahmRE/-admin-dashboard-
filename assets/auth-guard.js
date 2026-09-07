// Shared helpers for every page. Note: these are convenience redirects for
// a good user experience — the REAL security is the database's Row Level
// Security policies (see supabase/migrations). Even if someone bypassed
// all of this JavaScript, the database itself refuses to let a student
// read another student's data or act as an admin.

async function getCurrentUserAndProfile() {
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr) throw userErr;
  const user = userData.user;
  if (!user) return { user: null, profile: null };

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id, full_name, email, role, status")
    .eq("id", user.id)
    .single();

  if (profileErr) throw profileErr;

  return { user, profile };
}

async function requireAdminOrRedirect() {
  try {
    const { user, profile } = await getCurrentUserAndProfile();
    if (!user) {
      window.location.href = "/login.html";
      return null;
    }
    if (!profile || profile.role !== "admin") {
      window.location.href = "/index.html";
      return null;
    }
    return profile;
  } catch (err) {
    showFatalErrorOnPage(err);
    return null;
  }
}

function showFatalErrorOnPage(err) {
  const target = document.querySelector("main.content") || document.body;
  const message = err && err.message ? err.message : String(err);
  const box = document.createElement("div");
  box.className = "alert alert-danger";
  box.style.margin = "20px";
  box.innerHTML = `<strong>Something went wrong:</strong> <span class="mono">${escapeHtml(message)}</span>`;
  target.prepend(box);
}

// Call at the top of the student home page.
async function requireActiveStudentOrRedirect() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) {
    window.location.href = "/login.html";
    return null;
  }
  if (user.user_metadata?.must_change_password) {
    window.location.href = "/set-password.html";
    return null;
  }
  if (!profile || profile.role !== "student" || profile.status === "disabled") {
    await sb.auth.signOut();
    window.location.href = "/login.html";
    return null;
  }
  return profile;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = "/login.html";
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}
