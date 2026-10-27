/* Gateway controller: email/password sign-in + role-based routing. */
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const AUTH_ERRORS = {
  "auth/invalid-email": "That email address is not valid.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-login-credentials": "Incorrect email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait and try again.",
  "auth/network-request-failed": "Network error. Check your connection."
};

let routing = false;

async function routeByRole(user) {
  if (routing) return;
  routing = true;
  try {
    const snap = await database.ref("users/" + user.uid + "/role").once("value");
    const role = snap.val();
    if (role === "admin") window.location.href = "admin-dashboard.html";
    else if (role === "teacher") window.location.href = "teacher-dashboard.html";
    else if (role === "student") window.location.href = "student-dashboard.html";
    else {
      await auth.signOut();
      loginError.textContent = "No role is assigned to this account. Contact your administrator.";
      routing = false;
    }
  } catch (err) {
    console.error(err);
    await auth.signOut();
    loginError.textContent = "Could not read your access role. Please try again.";
    routing = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
}

auth.onAuthStateChanged(function (user) {
  if (user) routeByRole(user);
});

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) {
    loginError.textContent = "Enter both your email and password.";
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in…";
  try {
    await auth.signInWithEmailAndPassword(email, password);
    /* onAuthStateChanged performs the redirect */
  } catch (err) {
    loginError.textContent = AUTH_ERRORS[err.code] || "Sign-in failed. Please try again.";
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign In";
  }
});
