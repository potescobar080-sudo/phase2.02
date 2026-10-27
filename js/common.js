/* VENDOCINE shared helpers: auth guard, masking, escaping, audit logging. */
const DASHBOARDS = {
  admin: "admin-dashboard.html",
  teacher: "teacher-dashboard.html",
  student: "student-dashboard.html"
};

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* '123456789039' -> '••••••••••39' (only last 2 digits visible) */
function maskLRN(lrn) {
  const s = String(lrn || "");
  if (s.length <= 2) return "•".repeat(s.length);
  return "•".repeat(s.length - 2) + s.slice(-2);
}

function isValidLRN(lrn) {
  return /^\d{12}$/.test(String(lrn || ""));
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/* Renders an LRN cell: masked by default, revealed on hover or toggle click. */
function lrnCellHtml(lrn) {
  return '<span class="lrn-cell" data-lrn="' + escapeHtml(lrn) + '" data-revealed="false">' +
    '<span class="lrn-text">' + escapeHtml(maskLRN(lrn)) + '</span>' +
    '<button type="button" class="lrn-toggle" title="Show / hide LRN" aria-label="Toggle LRN visibility">👁</button>' +
    '</span>';
}

function setLrnState(cell, reveal) {
  const text = cell.querySelector(".lrn-text");
  const lrn = cell.getAttribute("data-lrn");
  text.textContent = reveal ? lrn : maskLRN(lrn);
  cell.setAttribute("data-revealed", reveal ? "true" : "false");
}

/* One delegated set of listeners covers every LRN cell, even re-rendered ones. */
function initLrnMasking() {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".lrn-toggle");
    if (!btn) return;
    const cell = btn.closest(".lrn-cell");
    setLrnState(cell, cell.getAttribute("data-revealed") !== "true");
  });
  document.addEventListener("mouseover", function (e) {
    const cell = e.target.closest(".lrn-cell");
    if (cell && cell.getAttribute("data-pinned") !== "true") setLrnState(cell, true);
  });
  document.addEventListener("mouseout", function (e) {
    const cell = e.target.closest(".lrn-cell");
    if (cell && !cell.contains(e.relatedTarget)) setLrnState(cell, false);
  });
}

/* Requires a signed-in user whose users/{uid}/role is in allowedRoles. */
function requireRole(allowedRoles, onReady) {
  auth.onAuthStateChanged(async function (user) {
    if (!user) { window.location.replace("index.html"); return; }
    try {
      const snap = await database.ref("users/" + user.uid).once("value");
      const profile = snap.val() || {};
      const role = profile.role;
      if (!role || allowedRoles.indexOf(role) === -1) {
        if (role && DASHBOARDS[role]) window.location.replace(DASHBOARDS[role]);
        else { await auth.signOut(); window.location.replace("index.html"); }
        return;
      }
      onReady(user, profile);
    } catch (err) {
      console.error("Role check failed:", err);
      await auth.signOut();
      window.location.replace("index.html");
    }
  });
}

function logout() {
  auth.signOut().then(function () { window.location.replace("index.html"); });
}

function logAudit(action, details, extra) {
  const user = auth.currentUser;
  const entry = Object.assign({
    action: action,
    details: details,
    user: user ? user.email : "system",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }, extra || {});
  return database.ref("auditLog").push(entry);
}

function showToast(message, isError) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = message;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () { t.className = "toast"; }, 3500);
}
