// Authentication: register / login / 2FA / password reset.
// Tiny stub — real implementations live elsewhere in real projects.

const users = new Map();

export function register(email, password) {
  if (users.has(email)) throw new Error("email_taken");
  users.set(email, { email, password, twoFactor: false });
  return { ok: true };
}

export function login(email, password) {
  const user = users.get(email);
  if (!user || user.password !== password) throw new Error("bad_credentials");
  if (user.twoFactor) return { step: "2fa_required" };
  return { step: "done", token: "session:" + email };
}

export function verifyTwoFactor(email, code) {
  const user = users.get(email);
  if (!user) throw new Error("bad_credentials");
  if (code !== "0000") throw new Error("bad_code");
  return { step: "done", token: "session:" + email };
}

export function requestPasswordReset(email) {
  if (!users.has(email)) throw new Error("unknown_email");
  return { ok: true };
}

export function confirmPasswordReset(email, code, newPassword) {
  const user = users.get(email);
  if (!user || code !== "0000") throw new Error("bad_code");
  user.password = newPassword;
  return { ok: true };
}

export function logout(token) {
  // stateless tokens — no-op in this stub
  return { ok: true };
}
