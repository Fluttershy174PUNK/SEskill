// Tiny HTTP shim around the auth + tasks modules.
// In a real app this would be Express/Hono/Fastify — kept as a stub here
// so the schemas have something concrete to refer to.

import * as auth from "./auth.js";
import * as tasks from "./tasks.js";

function tokenEmail(headers) {
  const t = headers.authorization?.replace(/^Bearer\s+/, "");
  return t?.startsWith("session:") ? t.slice("session:".length) : null;
}

export async function handle(req) {
  const email = tokenEmail(req.headers || {});
  try {
    if (req.path === "/register")   return { status: 200, body: auth.register(req.body.email, req.body.password) };
    if (req.path === "/login")      return { status: 200, body: auth.login(req.body.email, req.body.password) };
    if (req.path === "/2fa")        return { status: 200, body: auth.verifyTwoFactor(req.body.email, req.body.code) };
    if (req.path === "/reset/req")  return { status: 200, body: auth.requestPasswordReset(req.body.email) };
    if (req.path === "/reset/ok")   return { status: 200, body: auth.confirmPasswordReset(req.body.email, req.body.code, req.body.password) };

    if (!email) return { status: 401, body: { error: "auth_required" } };

    if (req.path === "/tasks")        return { status: 200, body: tasks.listTasks(email) };
    if (req.path === "/tasks/new")    return { status: 201, body: tasks.createTask(email, req.body) };
    if (req.path.startsWith("/tasks/")) {
      const id = req.path.slice("/tasks/".length);
      if (req.method === "PATCH")     return { status: 200, body: tasks.updateTask(email, id, req.body) };
      if (req.method === "DELETE")    return { status: 200, body: tasks.deleteTask(email, id) };
    }

    return { status: 404, body: { error: "not_found" } };
  } catch (err) {
    return { status: 400, body: { error: err.message } };
  }
}
