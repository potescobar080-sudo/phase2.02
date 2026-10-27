/* VENDOCINE Admin Command - real-time listeners, records, interlock, audit export. */
let students = {};
let machines = {};
let users = {};
let auditLog = {};
let secondaryApp = null;

requireRole(["admin"], function (user) {
  document.getElementById("adminEmail").textContent = user.email;
  initLrnMasking();
  initNav();
  initForms();
  attachListeners();
});

/* ---------- Navigation ---------- */
function initNav() {
  document.querySelectorAll(".nav-btn[data-section]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".nav-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".section").forEach(function (s) { s.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById(btn.getAttribute("data-section")).classList.add("active");
    });
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("downloadAuditBtn").addEventListener("click", downloadAuditReport);
  document.getElementById("studentSearch").addEventListener("input", renderStudents);
}

/* ---------- Live listeners ---------- */
function attachListeners() {
  database.ref("students").on("value", function (snap) {
    students = snap.val() || {};
    renderStudents(); renderClasses(); renderStats();
  }, function (e) { showToast("Students: " + e.message, true); });

  database.ref("machines").on("value", function (snap) {
    machines = snap.val() || {};
    enforceInterlock();
    renderMachines(); renderStats();
  }, function (e) { showToast("Machines: " + e.message, true); });

  database.ref("users").on("value", function (snap) {
    users = snap.val() || {};
    renderUsers(); renderTeachers(); renderStats();
  }, function (e) { showToast("Users: " + e.message, true); });

  database.ref("auditLog").limitToLast(500).on("value", function (snap) {
    auditLog = snap.val() || {};
    renderClaims(); renderRecent(); renderStats();
  }, function (e) { showToast("Audit log: " + e.message, true); });
}

function sortedAudit() {
  return Object.keys(auditLog).map(function (k) { return Object.assign({ _key: k }, auditLog[k]); })
    .sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
}

/* ---------- Stats ---------- */
function renderStats() {
  const studentList = Object.values(students);
  const teachers = Object.values(users).filter(function (u) { return u.role === "teacher"; });
  const totalClaims = studentList.reduce(function (n, s) { return n + (Number(s.totalClaims) || 0); }, 0);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const today = Object.values(auditLog).filter(function (a) {
    return a.action === "DISPENSE_SUCCESS" && a.timestamp >= startOfDay.getTime();
  }).length;
  const machineList = Object.values(machines);
  const stock = machineList.reduce(function (n, m) { return n + (Number(m.stock) || 0); }, 0);
  const locked = machineList.filter(function (m) { return Number(m.stock) === 0; }).length;

  document.getElementById("statStudents").textContent = studentList.length;
  document.getElementById("statTeachers").textContent = teachers.length;
  document.getElementById("statClaims").textContent = totalClaims;
  document.getElementById("statToday").textContent = today;
  document.getElementById("statStock").textContent = stock;
  document.getElementById("statLocked").textContent = locked;
  document.getElementById("statLockCard").classList.toggle("alert", locked > 0);
}

function renderRecent() {
  const rows = sortedAudit().slice(0, 10).map(function (a) {
    return "<tr><td>" + escapeHtml(formatDateTime(a.timestamp)) + "</td><td>" + escapeHtml(a.action) +
      "</td><td>" + escapeHtml(a.details) + "</td><td>" + escapeHtml(a.user) + "</td></tr>";
  });
  document.getElementById("recentBody").innerHTML = rows.join("") || '<tr><td colspan="4" class="empty">No activity yet.</td></tr>';
}

/* ---------- Students ---------- */
function renderStudents() {
  const q = document.getElementById("studentSearch").value.trim().toLowerCase();
  const list = Object.keys(students).map(function (k) { return Object.assign({ id: k }, students[k]); })
    .filter(function (s) {
      return !q || [s.name, s.class, s.email].join(" ").toLowerCase().indexOf(q) !== -1;
    })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

  document.getElementById("studentBody").innerHTML = list.map(function (s) {
    return "<tr><td>" + escapeHtml(s.name) + "</td><td>" + lrnCellHtml(s.lrn) + "</td><td>" + escapeHtml(s.class) +
      "</td><td>" + escapeHtml(s.email) + "</td><td>" + escapeHtml(s.pillsLeft) + " / 5</td><td>" + escapeHtml(s.totalClaims || 0) +
      '</td><td><button class="btn small secondary" data-edit="' + escapeHtml(s.id) + '">Edit</button> ' +
      '<button class="btn small danger" data-del="' + escapeHtml(s.id) + '">Delete</button></td></tr>';
  }).join("") || '<tr><td colspan="7" class="empty">No students found.</td></tr>';
}

function calcAge(birthDate) {
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = firebase.apps.find(function (a) { return a.name === "Secondary"; }) ||
      firebase.initializeApp(firebaseConfig, "Secondary");
  }
  return secondaryApp.auth();
}

function resetStudentForm() {
  document.getElementById("studentForm").reset();
  document.getElementById("sId").value = "";
  document.getElementById("sPills").value = 5;
  document.getElementById("studentFormTitle").textContent = "Add student";
  document.getElementById("sPassWrap").hidden = false;
  document.getElementById("studentCancel").hidden = true;
  document.getElementById("studentMsg").textContent = "";
}

function initForms() {
  /* Teacher registration */
  document.getElementById("teacherForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const msg = document.getElementById("teacherMsg");
    msg.textContent = "";
    const name = document.getElementById("tName").value.trim();
    const email = document.getElementById("tEmail").value.trim();
    const pass = document.getElementById("tPass").value;
    if (!name || !email || pass.length < 6) { msg.textContent = "Name, email and a 6+ character password are required."; return; }
    try {
      const cred = await getSecondaryAuth().createUserWithEmailAndPassword(email, pass);
      await database.ref("users/" + cred.user.uid).set({
        name: name, email: email, role: "teacher", createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      await getSecondaryAuth().signOut();
      await logAudit("TEACHER_REGISTERED", "Teacher account created for " + email);
      document.getElementById("teacherForm").reset();
      showToast("Teacher registered.");
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  /* Student add / edit */
  document.getElementById("studentForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const msg = document.getElementById("studentMsg");
    msg.textContent = "";
    const editId = document.getElementById("sId").value;
    const lrn = document.getElementById("sLrn").value.trim();
    const pills = parseInt(document.getElementById("sPills").value, 10);
    const birth = document.getElementById("sBirth").value;
    const name = document.getElementById("sName").value.trim();
    const email = document.getElementById("sEmail").value.trim();
    const cls = document.getElementById("sClass").value.trim();

    if (!name || !cls || !email || !birth) { msg.textContent = "Name, class, email and birth date are required."; return; }
    if (!isValidLRN(lrn)) { msg.textContent = "LRN must be exactly 12 digits."; return; }
    if (!(pills >= 1 && pills <= 5)) { msg.textContent = "Pills left must be between 1 and 5."; return; }
    const dup = Object.keys(students).some(function (k) { return students[k].lrn === lrn && k !== editId; });
    if (dup) { msg.textContent = "Another student already uses this LRN."; return; }

    try {
      const data = {
        name: name, lrn: lrn, class: cls, email: email,
        gender: document.getElementById("sGender").value,
        age: calcAge(birth), birthDate: birth, pillsLeft: pills, pillsPerMonth: 5,
        parentContact: document.getElementById("sParent").value.trim(),
        medicalNotes: document.getElementById("sNotes").value.trim(), status: "active"
      };
      if (editId) {
        await database.ref("students/" + editId).update(data);
        await logAudit("STUDENT_UPDATED", "Student record updated: " + name, { studentLRN: lrn });
      } else {
        const ref = database.ref("students").push();
        data.id = ref.key; data.totalClaims = 0;
        await ref.set(data);
        const pass = document.getElementById("sPass").value;
        if (pass) {
          if (pass.length < 6) throw new Error("Login password must be at least 6 characters.");
          const cred = await getSecondaryAuth().createUserWithEmailAndPassword(email, pass);
          await database.ref("users/" + cred.user.uid).set({
            name: name, email: email, role: "student", studentId: ref.key,
            createdAt: firebase.database.ServerValue.TIMESTAMP
          });
          await getSecondaryAuth().signOut();
        }
        await logAudit("STUDENT_CREATED", "Student registered: " + name, { studentLRN: lrn });
      }
      resetStudentForm();
      showToast("Student saved.");
    } catch (err) {
      msg.textContent = err.message;
    }
  });
  document.getElementById("studentCancel").addEventListener("click", resetStudentForm);

  /* Table actions (delegated) */
  document.getElementById("studentBody").addEventListener("click", async function (e) {
    const editId = e.target.getAttribute("data-edit");
    const delId = e.target.getAttribute("data-del");
    if (editId && students[editId]) {
      const s = students[editId];
      document.getElementById("sId").value = editId;
      document.getElementById("sName").value = s.name || "";
      document.getElementById("sLrn").value = s.lrn || "";
      document.getElementById("sClass").value = s.class || "";
      document.getElementById("sEmail").value = s.email || "";
      document.getElementById("sGender").value = s.gender || "female";
      document.getElementById("sBirth").value = s.birthDate || "";
      document.getElementById("sPills").value = s.pillsLeft || 1;
      document.getElementById("sParent").value = s.parentContact || "";
      document.getElementById("sNotes").value = s.medicalNotes || "";
      document.getElementById("studentFormTitle").textContent = "Edit student";
      document.getElementById("sPassWrap").hidden = true;
      document.getElementById("studentCancel").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (delId && students[delId]) {
      if (!confirm("Delete " + students[delId].name + "? This cannot be undone.")) return;
      try {
        await database.ref("students/" + delId).remove();
        await logAudit("STUDENT_DELETED", "Student record deleted: " + students[delId].name);
        showToast("Student deleted.");
      } catch (err) { showToast(err.message, true); }
    }
  });
}

/* ---------- Teachers & credentials ---------- */
function renderTeachers() {
  const rows = Object.keys(users).filter(function (k) { return users[k].role === "teacher"; }).map(function (k) {
    const u = users[k];
    return "<tr><td>" + escapeHtml(u.name) + "</td><td>" + escapeHtml(u.email) + "</td><td>" + escapeHtml(formatDateTime(u.createdAt)) + "</td></tr>";
  });
  document.getElementById("teacherBody").innerHTML = rows.join("") || '<tr><td colspan="3" class="empty">No teachers registered.</td></tr>';
}

function renderUsers() {
  const me = auth.currentUser ? auth.currentUser.uid : "";
  const rows = Object.keys(users).map(function (uid) {
    const u = users[uid];
    const isMe = uid === me;
    const roleSel = '<select data-role-uid="' + escapeHtml(uid) + '"' + (isMe ? " disabled" : "") + ">" +
      ["admin", "teacher", "student"].map(function (r) {
        return '<option value="' + r + '"' + (u.role === r ? " selected" : "") + ">" + r + "</option>";
      }).join("") + "</select>";
    return "<tr><td>" + escapeHtml(u.email) + "</td><td>" + escapeHtml(u.name) + "</td><td>" + roleSel + "</td><td>" +
      (isMe ? '<span class="badge">You</span>' : '<button class="btn small danger" data-revoke="' + escapeHtml(uid) + '">Revoke access</button>') + "</td></tr>";
  });
  document.getElementById("userBody").innerHTML = rows.join("") || '<tr><td colspan="4" class="empty">No users.</td></tr>';
}

document.addEventListener("change", async function (e) {
  const uid = e.target.getAttribute && e.target.getAttribute("data-role-uid");
  if (!uid) return;
  try {
    await database.ref("users/" + uid + "/role").set(e.target.value);
    await logAudit("ROLE_CHANGED", "Role of " + (users[uid] || {}).email + " set to " + e.target.value);
    showToast("Role updated.");
  } catch (err) { showToast(err.message, true); }
});

document.addEventListener("click", async function (e) {
  const uid = e.target.getAttribute && e.target.getAttribute("data-revoke");
  if (!uid || !users[uid]) return;
  if (!confirm("Revoke dashboard access for " + users[uid].email + "?")) return;
  try {
    await database.ref("users/" + uid).remove();
    await logAudit("ACCESS_REVOKED", "Access revoked for " + users[uid].email);
    showToast("Access revoked.");
  } catch (err) { showToast(err.message, true); }
});

/* ---------- Claims ---------- */
function renderClaims() {
  const rows = sortedAudit().filter(function (a) { return /DISPENSE/i.test(a.action || ""); }).map(function (a) {
    return "<tr><td>" + escapeHtml(formatDateTime(a.timestamp)) + "</td><td>" +
      (a.studentLRN ? lrnCellHtml(a.studentLRN) : "—") + "</td><td>" + escapeHtml(a.targetHopper || "—") +
      "</td><td>" + escapeHtml(a.details) + "</td><td>" + escapeHtml(a.user) + "</td></tr>";
  });
  document.getElementById("claimsBody").innerHTML = rows.join("") || '<tr><td colspan="5" class="empty">No claims recorded.</td></tr>';
}

/* ---------- Classes ---------- */
function renderClasses() {
  const groups = {};
  Object.values(students).forEach(function (s) {
    const c = s.class || "Unassigned";
    groups[c] = groups[c] || { count: 0, pills: 0 };
    groups[c].count++; groups[c].pills += Number(s.pillsLeft) || 0;
  });
  const rows = Object.keys(groups).sort().map(function (c) {
    return "<tr><td>" + escapeHtml(c) + "</td><td>" + groups[c].count + "</td><td>" + groups[c].pills +
      '</td><td><a class="btn small" href="class-details.html?class=' + encodeURIComponent(c) + '">Open class hub</a></td></tr>';
  });
  document.getElementById("classBody").innerHTML = rows.join("") || '<tr><td colspan="4" class="empty">No classes yet.</td></tr>';
}

/* ---------- Machines & interlock ---------- */
function enforceInterlock() {
  Object.keys(machines).forEach(function (id) {
    const m = machines[id];
    const stock = Number(m.stock) || 0;
    if (stock === 0 && (m.locked !== true || m.phase !== "standby")) {
      database.ref("machines/" + id).update({ locked: true, phase: "standby" });
    } else if (stock > 0 && m.locked === true) {
      database.ref("machines/" + id).update({ locked: false });
    }
  });
}

function renderMachines() {
  const ids = Object.keys(machines);
  document.getElementById("machineList").innerHTML = ids.map(function (id) {
    const m = machines[id];
    const stock = Number(m.stock) || 0;
    const cap = Number(m.capacity) || 60;
    const pct = Math.max(0, Math.min(100, Math.round((stock / cap) * 100)));
    const locked = stock === 0;
    const barCls = locked ? "zero" : (pct <= 25 ? "low" : "");
    const phases = ["standby", "authenticate", "dispense", "confirm"].map(function (p) {
      const disabled = locked && p !== "standby";
      return '<button class="btn small' + (m.phase === p ? "" : " secondary") + '" data-phase="' + p + '" data-mid="' + escapeHtml(id) + '"' +
        (disabled ? " disabled" : "") + ">" + p + "</button>";
    }).join("");
    return '<div class="machine' + (locked ? " locked" : "") + '"><div class="machine-head"><div><h3>' + escapeHtml(m.name || id) +
      '</h3><span style="color:var(--muted)">' + escapeHtml(m.location || "") + " · " + escapeHtml(id) + "</span></div>" +
      (locked ? '<div class="lockout">🔒 CHANNEL LOCKOUT</div>' : '<span class="badge">Phase: ' + escapeHtml(m.phase || "standby") + "</span>") +
      '</div><div class="bar"><div class="' + barCls + '" style="width:' + pct + '%"></div></div><strong>' + stock + " / " + cap + " units</strong> (" + pct + "%)" +
      '<div class="phase-row">' + phases + "</div>" +
      (locked ? '<p style="color:var(--red);font-weight:600;margin:.6rem 0 0">Phase commands are blocked until a restock is recorded.</p>' : "") +
      '<div class="restock-row"><input type="number" min="1" max="' + cap + '" placeholder="New stock count" id="restock-' + escapeHtml(id) + '">' +
      '<button class="btn small" data-restock="' + escapeHtml(id) + '">Record restock</button></div></div>';
  }).join("") || '<div class="empty">No machines registered under /machines.</div>';
}

document.getElementById("machineList").addEventListener("click", function (e) {
  const phase = e.target.getAttribute("data-phase");
  const mid = e.target.getAttribute("data-mid");
  const restockId = e.target.getAttribute("data-restock");
  if (phase && mid) sendPhase(mid, phase);
  if (restockId) restockMachine(restockId);
});

function sendPhase(id, phase) {
  /* Backend lock rule: the transaction aborts if stock is 0 and phase != standby. */
  database.ref("machines/" + id).transaction(function (current) {
    if (current === null) return current;
    if (phase !== "standby" && (Number(current.stock) || 0) <= 0) return; /* abort */
    current.phase = phase;
    current.locked = (Number(current.stock) || 0) === 0;
    return current;
  }, function (err, committed) {
    if (err) { showToast(err.message, true); return; }
    if (!committed) { showToast("🔒 Channel lockout: restock required before sending commands.", true); return; }
    logAudit("machine_phase_command", "Phase of " + id + " set to " + phase);
    showToast("Phase set to " + phase + ".");
  }, false);
}

function restockMachine(id) {
  const input = document.getElementById("restock-" + id);
  const value = parseInt(input.value, 10);
  const cap = Number((machines[id] || {}).capacity) || 60;
  if (!(value >= 1 && value <= cap)) { showToast("Enter a stock count between 1 and " + cap + ".", true); return; }
  database.ref("machines/" + id).transaction(function (current) {
    if (current === null) return current;
    current.stock = value;
    current.locked = false;
    return current;
  }, function (err, committed) {
    if (err || !committed) { showToast(err ? err.message : "Restock failed.", true); return; }
    logAudit("RESTOCK", id + " restocked to " + value + " units");
    input.value = "";
    showToast("Restock recorded.");
  }, false);
}

/* ---------- Compliance audit CSV ---------- */
function csvCell(value) {
  let s = String(value === undefined || value === null ? "" : value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; /* block spreadsheet formula injection */
  return '"' + s.replace(/"/g, '""') + '"';
}

async function downloadAuditReport() {
  const btn = document.getElementById("downloadAuditBtn");
  btn.disabled = true;
  try {
    const snap = await database.ref("auditLog").orderByChild("timestamp").once("value");
    const rows = [];
    snap.forEach(function (child) { rows.push(Object.assign({ id: child.key }, child.val())); });
    rows.sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });

    const header = ["Log ID", "Timestamp (ISO)", "Action", "Details", "User", "Student LRN (masked)", "Target Hopper"];
    const lines = [header.map(csvCell).join(",")];
    rows.forEach(function (r) {
      lines.push([
        r.id, r.timestamp ? new Date(r.timestamp).toISOString() : "", r.action, r.details, r.user,
        r.studentLRN ? maskLRN(r.studentLRN) : "", r.targetHopper || ""
      ].map(csvCell).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendocine-compliance-audit-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    await logAudit("AUDIT_REPORT_EXPORTED", "Compliance audit CSV exported (" + rows.length + " rows)");
    showToast("Audit report downloaded.");
  } catch (err) {
    showToast("Export failed: " + err.message, true);
  } finally {
    btn.disabled = false;
  }
}
