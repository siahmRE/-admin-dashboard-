function renderAdminHeader(activePage, fullName) {
  const el = document.getElementById("topbar");
  if (!el) return;
  el.innerHTML = `
    <div class="topbar-inner">
      <a href="/admin/index.html" class="brand">
        <span class="brand-mark">A</span>
        <span class="brand-name">Admin Dashboard</span>
      </a>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <nav class="nav">
          <a href="/admin/index.html" class="${activePage === "dashboard" ? "active" : ""}">Dashboard</a>
          <a href="/admin/students.html" class="${activePage === "students" ? "active" : ""}">Students</a>
        </nav>
        <div class="topbar-right">
          <span class="mono" style="display:none;" id="admin-name-desktop">${escapeHtml(fullName || "")}</span>
          <button class="btn-sm neutral" onclick="signOut()">Sign out</button>
        </div>
      </div>
    </div>
  `;
  const nameEl = document.getElementById("admin-name-desktop");
  if (nameEl && window.innerWidth > 640) nameEl.style.display = "inline";
}
