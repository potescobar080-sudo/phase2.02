/* Student telemetry panel: profile, history and scannable LRN barcode voucher. */
document.getElementById("logoutBtn").addEventListener("click", logout);

requireRole(["student"], async function (user, profile) {
  try {
    const student = await findStudent(user, profile);
    if (!student) { document.getElementById("notFound").hidden = false; return; }
    document.getElementById("content").hidden = false;
    renderStudent(student);
    renderVoucher(student);
    loadHistory(student);
    /* keep numbers live */
    database.ref("students/" + student.id).on("value", function (snap) {
      if (snap.val()) renderStudent(Object.assign({ id: snap.key }, snap.val()));
    });
  } catch (err) {
    console.error(err);
    document.getElementById("notFound").hidden = false;
    showToast(err.message, true);
  }
});

async function findStudent(user, profile) {
  if (profile.studentId) {
    const snap = await database.ref("students/" + profile.studentId).once("value");
    if (snap.val()) return Object.assign({ id: snap.key }, snap.val());
  }
  /* Fallback: match by email */
  const q = await database.ref("students").orderByChild("email").equalTo(user.email).limitToFirst(1).once("value");
  let found = null;
  q.forEach(function (c) { found = Object.assign({ id: c.key }, c.val()); });
  return found;
}

function renderStudent(s) {
  document.getElementById("pillsStat").textContent = (Number(s.pillsLeft) || 0) + " / 5";
  document.getElementById("limitStat").textContent = (s.pillsPerMonth || 5) + " / month";
  document.getElementById("claimsStat").textContent = s.totalClaims || 0;
  const rows = [
    ["Name", s.name], ["Class", s.class], ["Email", s.email],
    ["Gender", s.gender], ["Age", s.age], ["Birth date", s.birthDate],
    ["Monthly limit", (s.pillsPerMonth || 5) + " pills"], ["Status", s.status || "active"],
    ["Medical notes", s.medicalNotes || "—"]
  ];
  document.getElementById("profile").innerHTML = rows.map(function (r) {
    return "<dt>" + escapeHtml(r[0]) + "</dt><dd>" + escapeHtml(r[1]) + "</dd>";
  }).join("");
}

function renderVoucher(s) {
  document.getElementById("vName").textContent = s.name || "";
  document.getElementById("vClass").textContent = s.class || "";
  const err = document.getElementById("barcodeError");
  if (!isValidLRN(s.lrn)) { err.textContent = "Your LRN on file is invalid. Contact the administrator."; return; }
  document.getElementById("vLrnText").textContent = s.lrn;
  try {
    /* Code 128 is read natively by the GM65 engine; the quiet zone keeps scans reliable. */
    JsBarcode("#barcode", s.lrn, {
      format: "CODE128", width: 3, height: 110, displayValue: false,
      margin: 24, background: "#ffffff", lineColor: "#000000"
    });
  } catch (e) {
    err.textContent = "Could not render barcode: " + e.message;
    return;
  }
  document.getElementById("downloadBarcode").addEventListener("click", function () {
    const a = document.createElement("a");
    a.href = document.getElementById("barcode").toDataURL("image/png");
    a.download = "vendocine-voucher.png";
    a.click();
  });
}

function loadHistory(s) {
  database.ref("auditLog").orderByChild("studentLRN").equalTo(s.lrn).limitToLast(50).on("value", function (snap) {
    const rows = [];
    snap.forEach(function (c) { rows.push(c.val()); });
    rows.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    document.getElementById("historyBody").innerHTML = rows.map(function (r) {
      return "<tr><td>" + escapeHtml(formatDateTime(r.timestamp)) + "</td><td>" + escapeHtml(r.action) +
        "</td><td>" + escapeHtml(r.targetHopper || "—") + "</td><td>" + escapeHtml(r.details) + "</td></tr>";
    }).join("") || '<tr><td colspan="4" class="empty">No account history yet.</td></tr>';
  }, function (e) {
    document.getElementById("historyBody").innerHTML = '<tr><td colspan="4" class="empty">History unavailable.</td></tr>';
    console.warn(e.message);
  });
}
