/* Teacher landing page: lists classes and links to the class monitoring hub. */
document.getElementById("logoutBtn").addEventListener("click", logout);

requireRole(["teacher"], function (user) {
  document.getElementById("teacherEmail").textContent = user.email;
  database.ref("students").on("value", function (snap) {
    const groups = {};
    Object.values(snap.val() || {}).forEach(function (s) {
      const c = s.class || "Unassigned";
      groups[c] = groups[c] || { count: 0, pills: 0 };
      groups[c].count++; groups[c].pills += Number(s.pillsLeft) || 0;
    });
    document.getElementById("classBody").innerHTML = Object.keys(groups).sort().map(function (c) {
      return "<tr><td>" + escapeHtml(c) + "</td><td>" + groups[c].count + "</td><td>" + groups[c].pills +
        '</td><td><a class="btn small" href="class-details.html?class=' + encodeURIComponent(c) + '">Open class hub</a></td></tr>';
    }).join("") || '<tr><td colspan="4" class="empty">No classes yet.</td></tr>';
  }, function (e) { showToast(e.message, true); });
});
