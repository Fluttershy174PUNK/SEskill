// Tiny task list: per-user CRUD.

const tasksByUser = new Map();

function getList(email) {
  let list = tasksByUser.get(email);
  if (!list) { list = []; tasksByUser.set(email, list); }
  return list;
}

export function listTasks(email) {
  return [...getList(email)];
}

export function createTask(email, { title, body = "" }) {
  const task = { id: crypto.randomUUID(), title, body, done: false };
  getList(email).push(task);
  return task;
}

export function updateTask(email, id, patch) {
  const list = getList(email);
  const i = list.findIndex(t => t.id === id);
  if (i < 0) throw new Error("not_found");
  list[i] = { ...list[i], ...patch };
  return list[i];
}

export function deleteTask(email, id) {
  const list = getList(email);
  const i = list.findIndex(t => t.id === id);
  if (i < 0) throw new Error("not_found");
  list.splice(i, 1);
  return { ok: true };
}
