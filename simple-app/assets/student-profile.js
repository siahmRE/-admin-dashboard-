let studentId = null;
let studentData = null;
let conversationId = null;

async function callAdminAction(action, payload) {
  // Calls your real Supabase function (named "smart-api" in your project,
  // even though its logic is the "admin-actions" behavior).
  const { data, error } = await sb.functions.invoke("smart-api", { body: { action, ...payload } });
  if (error) {
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

function renderActions() {
  const actionsEl = document.getElementById("p-actions");
  const statusBtn =
    studentData.status === "active"
      ? `<button class="btn-sm warn" id="btn-disable" style="border:1px solid var(--rule);">Disable account</button>`
      : `<button class="btn-sm accent" id="btn-reactivate" style="border:1px solid var(--rule);">Reactivate account</button>`;
  const deleteBtn =
    studentData.status === "disabled"
      ? `<button class="btn-sm danger" id="btn-delete" style="border:1px solid var(--rule);">Delete permanently</button>`
      : "";
  actionsEl.innerHTML = `${statusBtn}<button class="btn-sm neutral" id="btn-reset" style="border:1px solid var(--rule);">Reset password</button>${deleteBtn}`;
  document.getElementById("p-delete-hint").classList.toggle("hidden", studentData.status !== "active");

  if (document.getElementById("btn-disable")) document.getElementById("btn-disable").addEventListener("click", () => changeStatus("disabled"));
  if (document.getElementById("btn-reactivate")) document.getElementById("btn-reactivate").addEventListener("click", () => changeStatus("active"));
  document.getElementById("btn-reset").addEventListener("click", resetPassword);
  if (document.getElementById("btn-delete")) document.getElementById("btn-delete").addEventListener("click", openDeleteModal);
}

async function changeStatus(newStatus) {
  const { error } = await callAdminAction("status", { id: studentId, newStatus });
  const banner = document.getElementById("p-banner");
  if (error) {
    banner.textContent = error;
    banner.classList.remove("hidden");
    return;
  }
  banner.classList.add("hidden");
  await loadStudent();
}

async function resetPassword() {
  const { data, error } = await callAdminAction("reset_password", { id: studentId });
  const banner = document.getElementById("p-banner");
  if (error) {
    banner.textContent = error;
    banner.classList.remove("hidden");
    return;
  }
  document.getElementById("r-email").textContent = data.email;
  document.getElementById("r-password").textContent = data.temporaryPassword;
  document.getElementById("reset-modal").classList.remove("hidden");
}

function openDeleteModal() {
  document.getElementById("delete-name").textContent = studentData.full_name;
  document.getElementById("delete-confirm-input").value = "";
  document.getElementById("delete-confirm-btn").disabled = true;
  document.getElementById("delete-error").classList.add("hidden");
  document.getElementById("delete-modal").classList.remove("hidden");
}

function renderChatInput() {
  const area = document.getElementById("chat-input-area");
  if (studentData.status === "disabled") {
    area.innerHTML = `<p class="muted" style="padding:12px 18px; border-top:1px solid var(--rule); font-size:12px;">This account is disabled. Reactivate it to send messages.</p>`;
    return;
  }
  area.innerHTML = `
    <div class="chat-input-row">
      <input class="input" id="chat-draft" placeholder="Write a message…" />
      <button class="btn btn-primary" id="chat-send">Send</button>
    </div>
  `;
  document.getElementById("chat-send").addEventListener("click", sendMessage);
  document.getElementById("chat-draft").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

function renderMessages(messages) {
  const el = document.getElementById("chat-messages");
  if (!messages || messages.length === 0) {
    el.innerHTML = `<p class="muted" style="text-align:center; font-size:13px;">No messages yet.</p>`;
    return;
  }
  el.innerHTML = messages
    .map((m) => {
      const mine = m.sender_role === "admin";
      const body = m.body ? escapeHtml(m.body) : m.audio_url ? "<em>Voice message</em>" : "";
      return `
      <div class="msg-row ${mine ? "mine" : ""}">
        <div class="msg-bubble ${m.sender_role}">
          <p>${body}</p>
          <p class="msg-time">${new Date(m.created_at).toLocaleString()}</p>
        </div>
      </div>`;
    })
    .join("");
  el.scrollTop = el.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById("chat-draft");
  const text = input.value.trim();
  if (!text || !conversationId) return;

  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, sender_role: "admin", body: text })
    .select()
    .single();

  if (!error && data) {
    input.value = "";
    const { data: messages } = await sb
      .from("messages")
      .select("id, sender_role, body, audio_url, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    renderMessages(messages);
  }
}

async function loadStudent() {
  const { data: student, error } = await sb
    .from("profiles")
    .select("id, full_name, email, phone, student_id, notes, status, created_at, last_activity_at")
    .eq("id", studentId)
    .eq("role", "student")
    .single();

  if (error || !student) {
    document.getElementById("loading").innerHTML = `<p class="muted">Student not found.</p>`;
    return;
  }
  studentData = student;

  document.getElementById("loading").classList.add("hidden");
  document.getElementById("profile-wrap").classList.remove("hidden");

  document.getElementById("p-name").textContent = student.full_name;
  document.getElementById("p-status-pill").innerHTML = `<span class="pill pill-${student.status}">${student.status}</span>`;
  document.getElementById("p-fullname").value = student.full_name;
  document.getElementById("p-email").value = student.email;
  document.getElementById("p-phone").value = student.phone || "";
  document.getElementById("p-notes").value = student.notes || "";
  if (student.student_id) {
    document.getElementById("p-studentid-field").classList.remove("hidden");
    document.getElementById("p-studentid").value = student.student_id;
  }
  document.getElementById("p-added").textContent = `Added ${formatDate(student.created_at)}`;
  document.getElementById("p-last-active").textContent = `Last activity ${formatDate(student.last_activity_at)}`;

  renderActions();
  renderChatInput();

  const { data: convo } = await sb.from("conversations").select("id").eq("student_id", studentId).maybeSingle();
  conversationId = convo?.id ?? null;

  if (conversationId) {
    const { data: messages } = await sb
      .from("messages")
      .select("id, sender_role, body, audio_url, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    renderMessages(messages);
  } else {
    renderMessages([]);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAdminOrRedirect();
  if (!profile) return;
  renderAdminHeader("students", profile.full_name);

  const params = new URLSearchParams(window.location.search);
  studentId = params.get("id");
  if (!studentId) {
    window.location.href = "/admin/students.html";
    return;
  }

  await loadStudent();

  document.getElementById("p-save").addEventListener("click", async () => {
    const btn = document.getElementById("p-save");
    btn.disabled = true;
    btn.textContent = "Saving…";
    const { error } = await sb
      .from("profiles")
      .update({
        full_name: document.getElementById("p-fullname").value.trim(),
        phone: document.getElementById("p-phone").value.trim() || null,
        notes: document.getElementById("p-notes").value.trim() || null,
      })
      .eq("id", studentId);
    btn.disabled = false;
    btn.textContent = error ? "Save changes" : "Saved ✓";
    if (!error) {
      await loadStudent();
      setTimeout(() => (btn.textContent = "Save changes"), 1800);
    } else {
      const banner = document.getElementById("p-banner");
      banner.textContent = "Could not save changes.";
      banner.classList.remove("hidden");
    }
  });

  document.getElementById("close-delete").addEventListener("click", () => document.getElementById("delete-modal").classList.add("hidden"));
  document.getElementById("delete-cancel").addEventListener("click", () => document.getElementById("delete-modal").classList.add("hidden"));
  document.getElementById("delete-confirm-input").addEventListener("input", (e) => {
    document.getElementById("delete-confirm-btn").disabled = e.target.value.trim().toUpperCase() !== "DELETE";
  });
  document.getElementById("delete-confirm-btn").addEventListener("click", async () => {
    const btn = document.getElementById("delete-confirm-btn");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    const { error } = await callAdminAction("delete", { id: studentId, confirm: true });
    if (error) {
      const errBox = document.getElementById("delete-error");
      errBox.textContent = error;
      errBox.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Delete permanently";
      return;
    }
    window.location.href = "/admin/students.html";
  });

  document.getElementById("close-reset").addEventListener("click", () => document.getElementById("reset-modal").classList.add("hidden"));
  document.getElementById("reset-done").addEventListener("click", () => document.getElementById("reset-modal").classList.add("hidden"));

  if (window.location.hash === "#chat") {
    document.getElementById("chat").scrollIntoView({ behavior: "smooth" });
  }
});
