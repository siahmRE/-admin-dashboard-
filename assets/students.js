let students = [];
let capValue = 80;
let pendingDeleteStudent = null;

async function callAdminAction(action, payload) {
  // Calls your real Supabase function (named "smart-api" in your project,
  // even though its logic is the "admin-actions" behavior).
  const { data, error } = await sb.functions.invoke("smart-api", { body: { action, ...payload } });
  if (error) {
    // supabase-js wraps non-2xx responses as a FunctionsHttpError; the real
    // error body is on error.context, but to keep this simple we surface a
    // best-effort message and let callers show data?.error when present.
    let message = "Something went wrong.";
    try {
      const body = await error.context.json();
      message = body?.error || message;
    } catch {}
    return { data: null, error: message };
  }
  if (data?.error) return { data: null, error: data.error };
  return { data, error: null };
}

function showBanner(text) {
  const el = document.getElementById("banner");
  el.textContent = text;
  el.classList.remove("hidden");
  el.innerHTML = `<span>${escapeHtml(text)}</span><button style="background:none;border:none;color:var(--ink-faint);cursor:pointer;" onclick="document.getElementById('banner').classList.add('hidden')">✕</button>`;
}

function statusPillHtml(status) {
  return `<span class="pill pill-${status}">${status}</span>`;
}

function unreadHtml(count) {
  return count > 0
    ? `<span class="badge-unread">${count} unread</span>`
    : `<span class="muted">—</span>`;
}

function actionsHtml(s) {
  const statusBtn =
    s.status === "active"
      ? `<button class="btn-sm warn" onclick="handleDisable('${s.id}')">Disable</button>`
      : `<button class="btn-sm accent" onclick="handleReactivate('${s.id}')">Reactivate</button>`;
  const deleteBtn =
    s.status === "disabled"
      ? `<button class="btn-sm danger" onclick="openDeleteModal('${s.id}')">Delete</button>`
      : "";
  return `
    <a class="btn-sm accent" href="/admin/student.html?id=${s.id}#chat">Chat</a>
    <a class="btn-sm neutral" href="/admin/student.html?id=${s.id}">Profile</a>
    ${statusBtn}
    <button class="btn-sm neutral" onclick="handleResetPassword('${s.id}')">Reset password</button>
    ${deleteBtn}
  `;
}

function renderList() {
  const activeCount = students.filter((s) => s.status === "active").length;
  document.getElementById("cap-line").textContent = `${activeCount} / ${capValue} active`;

  const tableWrap = document.getElementById("table-wrap");
  const cardList = document.getElementById("card-list");

  if (students.length === 0) {
    const msg = document.getElementById("search").value
      ? "No students match your search."
      : "No students yet. Add your first student to get started.";
    tableWrap.innerHTML = `<p class="empty-row">${msg}</p>`;
    cardList.innerHTML = "";
    return;
  }

  tableWrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Student</th><th>Phone</th><th>Status</th><th>Added</th><th>Last activity</th><th>Unread</th><th style="text-align:right;">Actions</th>
      </tr></thead>
      <tbody>
        ${students
          .map(
            (s) => `
          <tr>
            <td><a href="/admin/student.html?id=${s.id}" style="font-weight:500; text-decoration:none;">${escapeHtml(s.full_name)}</a>
              <p class="muted" style="font-size:13px; margin:2px 0 0;">${escapeHtml(s.email)}</p></td>
            <td class="mono">${escapeHtml(s.phone) || "—"}</td>
            <td>${statusPillHtml(s.status)}</td>
            <td class="mono">${formatDate(s.created_at)}</td>
            <td class="mono">${formatDate(s.last_activity_at)}</td>
            <td>${unreadHtml(s.unread_count)}</td>
            <td><div class="action-row" style="justify-content:flex-end;">${actionsHtml(s)}</div></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  cardList.innerHTML = students
    .map(
      (s) => `
    <div class="student-card">
      <div class="flex-between" style="align-items:flex-start;">
        <div style="min-width:0;">
          <a href="/admin/student.html?id=${s.id}" style="font-weight:500; text-decoration:none;">${escapeHtml(s.full_name)}</a>
          <p class="muted" style="font-size:13px; margin:2px 0 0;">${escapeHtml(s.email)}</p>
          ${s.phone ? `<p class="mono muted" style="font-size:12px; margin:2px 0 0;">${escapeHtml(s.phone)}</p>` : ""}
        </div>
        <div style="text-align:right; flex-shrink:0;">
          ${statusPillHtml(s.status)}<br/>
          <div style="margin-top:4px;">${unreadHtml(s.unread_count)}</div>
        </div>
      </div>
      <div class="mono muted flex-between" style="font-size:11px; margin-top:10px;">
        <span>Added ${formatDate(s.created_at)}</span><span>Active ${formatDate(s.last_activity_at)}</span>
      </div>
      <div class="action-row" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--rule);">${actionsHtml(s)}</div>
    </div>`
    )
    .join("");
}

async function loadStudents(query) {
  document.getElementById("table-wrap").innerHTML = `<p class="muted" style="padding:24px; text-align:center;">Loading…</p>`;
  const { data, error } = await callAdminAction("list", { search: query || "" });
  if (error) {
    showBanner(error);
    students = [];
  } else {
    students = data.students || [];
  }
  renderList();
}

function openAddModal() {
  document.getElementById("add-form").classList.remove("hidden");
  document.getElementById("add-success").classList.add("hidden");
  document.getElementById("add-modal").classList.remove("hidden");
}
function closeAddModal() {
  document.getElementById("add-modal").classList.add("hidden");
  document.getElementById("add-form").reset();
  document.getElementById("optional-fields").classList.add("hidden");
  document.getElementById("add-error").classList.add("hidden");
  history.replaceState(null, "", "/admin/students.html");
}

async function handleDisable(id) {
  const { error } = await callAdminAction("status", { id, newStatus: "disabled" });
  if (error) return showBanner(error);
  showBanner("Student disabled.");
  loadStudents(document.getElementById("search").value);
}
async function handleReactivate(id) {
  const { error } = await callAdminAction("status", { id, newStatus: "active" });
  if (error) return showBanner(error);
  showBanner("Student reactivated.");
  loadStudents(document.getElementById("search").value);
}
async function handleResetPassword(id) {
  const { data, error } = await callAdminAction("reset_password", { id });
  if (error) return showBanner(error);
  document.getElementById("r-email").textContent = data.email;
  document.getElementById("r-password").textContent = data.temporaryPassword;
  document.getElementById("reset-modal").classList.remove("hidden");
}

function openDeleteModal(id) {
  const student = students.find((s) => s.id === id);
  pendingDeleteStudent = student;
  document.getElementById("delete-name").textContent = student.full_name;
  document.getElementById("delete-confirm-input").value = "";
  document.getElementById("delete-confirm-btn").disabled = true;
  document.getElementById("delete-error").classList.add("hidden");
  document.getElementById("delete-modal").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAdminOrRedirect();
  if (!profile) return;
  renderAdminHeader("students", profile.full_name);

  const { data: stats } = await sb.rpc("admin_dashboard_stats").single();
  capValue = stats?.max_active_students ?? 80;

  const params = new URLSearchParams(window.location.search);
  if (params.get("add") === "1") openAddModal();

  await loadStudents("");

  let searchTimeout;
  document.getElementById("search").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadStudents(e.target.value), 250);
  });

  document.getElementById("add-btn").addEventListener("click", openAddModal);
  document.getElementById("close-add").addEventListener("click", closeAddModal);
  document.getElementById("add-done").addEventListener("click", () => {
    closeAddModal();
    loadStudents(document.getElementById("search").value);
  });

  document.getElementById("toggle-optional").addEventListener("click", () => {
    document.getElementById("optional-fields").classList.remove("hidden");
    document.getElementById("toggle-optional").classList.add("hidden");
  });

  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("add-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating…";

    const { data, error } = await callAdminAction("create", {
      fullName: document.getElementById("f-name").value.trim(),
      email: document.getElementById("f-email").value.trim(),
      phone: document.getElementById("f-phone").value.trim(),
      studentId: document.getElementById("f-studentid").value.trim(),
      notes: document.getElementById("f-notes").value.trim(),
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Create Student";

    if (error) {
      const errBox = document.getElementById("add-error");
      errBox.textContent = error;
      errBox.classList.remove("hidden");
      return;
    }

    document.getElementById("s-email").textContent = data.setup.email;
    document.getElementById("s-password").textContent = data.setup.temporaryPassword;
    document.getElementById("add-form").classList.add("hidden");
    document.getElementById("add-success").classList.remove("hidden");
  });

  document.getElementById("copy-creds").addEventListener("click", async () => {
    const text = `Email: ${document.getElementById("s-email").textContent}\nTemporary password: ${document.getElementById("s-password").textContent}`;
    await navigator.clipboard.writeText(text);
    document.getElementById("copy-creds").textContent = "Copied ✓";
  });
  document.getElementById("copy-reset").addEventListener("click", async () => {
    const text = `Email: ${document.getElementById("r-email").textContent}\nTemporary password: ${document.getElementById("r-password").textContent}`;
    await navigator.clipboard.writeText(text);
    document.getElementById("copy-reset").textContent = "Copied ✓";
  });

  document.getElementById("close-reset").addEventListener("click", () => document.getElementById("reset-modal").classList.add("hidden"));
  document.getElementById("reset-done").addEventListener("click", () => document.getElementById("reset-modal").classList.add("hidden"));

  document.getElementById("close-delete").addEventListener("click", () => document.getElementById("delete-modal").classList.add("hidden"));
  document.getElementById("delete-cancel").addEventListener("click", () => document.getElementById("delete-modal").classList.add("hidden"));
  document.getElementById("delete-confirm-input").addEventListener("input", (e) => {
    document.getElementById("delete-confirm-btn").disabled = e.target.value.trim().toUpperCase() !== "DELETE";
  });
  document.getElementById("delete-confirm-btn").addEventListener("click", async () => {
    const btn = document.getElementById("delete-confirm-btn");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    const { error } = await callAdminAction("delete", { id: pendingDeleteStudent.id, confirm: true });
    if (error) {
      const errBox = document.getElementById("delete-error");
      errBox.textContent = error;
      errBox.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Delete permanently";
      return;
    }
    document.getElementById("delete-modal").classList.add("hidden");
    showBanner(`${pendingDeleteStudent.full_name} was permanently deleted.`);
    loadStudents(document.getElementById("search").value);
  });
});
