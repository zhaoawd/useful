import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const logDir = path.join(__dirname, "logs");
const tasksFile = path.join(dataDir, "tasks.json");
const projectsFile = path.join(dataDir, "projects.json");
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4321);
const running = new Map();

await mkdir(dataDir, { recursive: true });
await mkdir(logDir, { recursive: true });
await ensureTasksFile();
await ensureProjectsFile();

function nowIso() {
  return new Date().toISOString();
}

function id() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureTasksFile() {
  try {
    await stat(tasksFile);
  } catch {
    await writeFile(tasksFile, JSON.stringify({ tasks: [] }, null, 2));
  }
}

async function ensureProjectsFile() {
  try {
    await stat(projectsFile);
  } catch {
    await writeFile(projectsFile, JSON.stringify({ projects: [] }, null, 2));
  }
}

async function loadTasks() {
  const raw = await readFile(tasksFile, "utf8");
  const data = JSON.parse(raw || "{\"tasks\":[]}");
  return Array.isArray(data.tasks) ? data.tasks : [];
}

async function loadProjects() {
  const raw = await readFile(projectsFile, "utf8");
  const data = JSON.parse(raw || "{\"projects\":[]}");
  return Array.isArray(data.projects) ? data.projects : [];
}

async function saveTasks(tasks) {
  await writeFile(tasksFile, JSON.stringify({ tasks }, null, 2));
}

async function saveProjects(projects) {
  await writeFile(projectsFile, JSON.stringify({ projects }, null, 2));
}

function normalizeProject(input, existing = {}) {
  return {
    ...existing,
    id: existing.id || input.id || id(),
    name: String(input.name || existing.name || "Untitled project").trim(),
    path: String(input.path || existing.path || "").trim(),
    notes: String(input.notes ?? existing.notes ?? "").trim(),
    pinned: Boolean(input.pinned ?? existing.pinned ?? false),
    sortOrder: Number(input.sortOrder ?? existing.sortOrder ?? Date.now()),
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function projectView(project) {
  return normalizeProject(project, project);
}

function sortProjects(projects) {
  return projects
    .map(projectView)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
}

function normalizeTask(input, existing = {}) {
  const schedule = input.schedule || existing.schedule || { type: "manual" };
  return {
    ...existing,
    id: existing.id || input.id || id(),
    name: String(input.name || existing.name || "Untitled task").trim(),
    projectId: input.projectId ?? existing.projectId ?? "",
    cwd: String(input.cwd || existing.cwd || process.cwd()).trim(),
    prompt: String(input.prompt || existing.prompt || "").trim(),
    commandTemplate: String(
      input.commandTemplate ||
        existing.commandTemplate ||
        'claude --print "$TASK_PROMPT" --permission-mode acceptEdits'
    ).trim(),
    authCheckEnabled: Boolean(input.authCheckEnabled ?? existing.authCheckEnabled ?? true),
    authCheckCommand: String(input.authCheckCommand || existing.authCheckCommand || "claude auth status").trim(),
    authLoginCommand: String(input.authLoginCommand || existing.authLoginCommand || "claude").trim(),
    authTimeoutSeconds: Number(input.authTimeoutSeconds || existing.authTimeoutSeconds || 300),
    enabled: Boolean(input.enabled ?? existing.enabled ?? true),
    maxRuntimeMinutes: Number(input.maxRuntimeMinutes || existing.maxRuntimeMinutes || 90),
    schedule,
    lastRunAt: existing.lastRunAt || null,
    lastStatus: existing.lastStatus || "never",
    lastLog: existing.lastLog || null,
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

async function resolveTaskCwd(task) {
  if (task.projectId) {
    const projects = await loadProjects();
    const project = projects.find((item) => item.id === task.projectId);
    if (project?.path) return project.path;
  }
  return task.cwd;
}

function taskEnv(task, cwd, reason) {
  return {
    ...process.env,
    TASK_PROMPT: task.prompt,
    TASK_NAME: task.name,
    TASK_PROJECT_ID: task.projectId || "",
    TASK_CWD: cwd,
    TASK_REASON: reason
  };
}

function parseTimeOnDate(base, hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function nextRunAt(task, from = new Date()) {
  if (!task.enabled || running.has(task.id)) return null;
  const schedule = task.schedule || { type: "manual" };
  const last = task.lastRunAt ? new Date(task.lastRunAt) : null;

  if (schedule.type === "once") {
    const runAt = schedule.runAt ? new Date(schedule.runAt) : null;
    if (!runAt || Number.isNaN(runAt.getTime())) return null;
    if (last && last >= runAt) return null;
    return runAt;
  }

  if (schedule.type === "interval") {
    const minutes = Math.max(1, Number(schedule.minutes || 60));
    const start = schedule.startAt ? new Date(schedule.startAt) : null;
    if (last) return new Date(last.getTime() + minutes * 60_000);
    if (start && start > from) return start;
    return new Date(from.getTime() + minutes * 60_000);
  }

  if (schedule.type === "daily") {
    const times = Array.isArray(schedule.times) ? schedule.times : [];
    const candidates = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const day = new Date(from);
      day.setDate(day.getDate() + offset);
      for (const t of times) {
        const candidate = parseTimeOnDate(day, t);
        if (!candidate) continue;
        if (candidate > from && (!last || candidate > last)) candidates.push(candidate);
      }
    }
    return candidates.sort((a, b) => a - b)[0] || null;
  }

  if (schedule.type === "weekly") {
    const days = Array.isArray(schedule.days) ? schedule.days.map(Number) : [];
    const times = Array.isArray(schedule.times) ? schedule.times : [];
    const candidates = [];
    for (let offset = 0; offset < 21; offset += 1) {
      const day = new Date(from);
      day.setDate(day.getDate() + offset);
      if (!days.includes(day.getDay())) continue;
      for (const t of times) {
        const candidate = parseTimeOnDate(day, t);
        if (!candidate) continue;
        if (candidate > from && (!last || candidate > last)) candidates.push(candidate);
      }
    }
    return candidates.sort((a, b) => a - b)[0] || null;
  }

  return null;
}

function dueRunAt(task, from = new Date()) {
  if (!task.enabled || running.has(task.id)) return null;
  const schedule = task.schedule || { type: "manual" };
  const last = task.lastRunAt ? new Date(task.lastRunAt) : null;

  if (schedule.type === "once") {
    const runAt = schedule.runAt ? new Date(schedule.runAt) : null;
    if (!runAt || Number.isNaN(runAt.getTime())) return null;
    if (runAt <= from && (!last || last < runAt)) return runAt;
    return null;
  }

  if (schedule.type === "interval") {
    const minutes = Math.max(1, Number(schedule.minutes || 60));
    const start = schedule.startAt ? new Date(schedule.startAt) : null;
    const due = last
      ? new Date(last.getTime() + minutes * 60_000)
      : start && start > from
        ? start
        : null;
    return due && due <= from ? due : null;
  }

  if (schedule.type === "daily") {
    const times = Array.isArray(schedule.times) ? schedule.times : [];
    const candidates = [];
    for (let offset = -8; offset <= 0; offset += 1) {
      const day = new Date(from);
      day.setDate(day.getDate() + offset);
      for (const t of times) {
        const candidate = parseTimeOnDate(day, t);
        if (!candidate) continue;
        if (candidate <= from && (!last || candidate > last)) candidates.push(candidate);
      }
    }
    return candidates.sort((a, b) => b - a)[0] || null;
  }

  if (schedule.type === "weekly") {
    const days = Array.isArray(schedule.days) ? schedule.days.map(Number) : [];
    const times = Array.isArray(schedule.times) ? schedule.times : [];
    const candidates = [];
    for (let offset = -21; offset <= 0; offset += 1) {
      const day = new Date(from);
      day.setDate(day.getDate() + offset);
      if (!days.includes(day.getDay())) continue;
      for (const t of times) {
        const candidate = parseTimeOnDate(day, t);
        if (!candidate) continue;
        if (candidate <= from && (!last || candidate > last)) candidates.push(candidate);
      }
    }
    return candidates.sort((a, b) => b - a)[0] || null;
  }

  return null;
}

function taskView(task, projects = []) {
  const normalizedTask = normalizeTask(task, task);
  const next = nextRunAt(normalizedTask);
  const project = projects.find((item) => item.id === normalizedTask.projectId);
  return {
    ...normalizedTask,
    projectName: project?.name || "",
    resolvedCwd: project?.path || normalizedTask.cwd,
    running: running.has(normalizedTask.id),
    nextRunAt: next ? next.toISOString() : null
  };
}

async function runTask(task, reason = "scheduled") {
  task = normalizeTask(task, task);
  if (running.has(task.id)) return;

  const startedAt = new Date();
  const cwd = await resolveTaskCwd(task);
  const safeName = task.name.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 48);
  const logName = `${startedAt.toISOString().replace(/[:.]/g, "-")}-${safeName}.log`;
  const logPath = path.join(logDir, logName);
  const log = createWriteStream(logPath, { flags: "a" });
  const timeoutMs = Math.max(1, Number(task.maxRuntimeMinutes || 90)) * 60_000;
  const env = taskEnv(task, cwd, reason);
  running.set(task.id, { kill: () => {} });
  log.on("error", (error) => {
    console.error(`Log write failed for ${task.name}:`, error);
  });
  log.write(`[${nowIso()}] task=${task.name}\n`);
  log.write(`[${nowIso()}] cwd=${cwd}\n`);
  log.write(`[${nowIso()}] reason=${reason}\n`);
  log.write(`[${nowIso()}] command=${task.commandTemplate}\n\n`);

  const finish = async (status, exitLine) => {
    running.delete(task.id);
    log.write(`\n[${nowIso()}] ${exitLine}\n`);
    log.end();

    const tasks = await loadTasks();
    const idx = tasks.findIndex((item) => item.id === task.id);
    if (idx !== -1) {
      tasks[idx] = {
        ...tasks[idx],
        lastRunAt: startedAt.toISOString(),
        lastStatus: status,
        lastLog: logName,
        updatedAt: nowIso()
      };
      await saveTasks(tasks);
    }
  };

  const runShellStep = (label, command, timeoutSeconds) =>
    new Promise((resolve) => {
      log.write(`\n[${nowIso()}] ${label}: ${command}\n`);
      const child = spawn(command, { cwd, shell: true, env });
      running.set(task.id, child);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        log.write(`\n[${nowIso()}] ${label} timeout after ${timeoutSeconds} seconds\n`);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, Math.max(1, Number(timeoutSeconds || 120)) * 1000);
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        log.write(`\n[${nowIso()}] ${label} exit code=${code} signal=${signal || ""}\n`);
        resolve({ code, signal, timedOut });
      });
    });

  if (task.authCheckEnabled) {
    const authCheck = await runShellStep("auth check", task.authCheckCommand, task.authTimeoutSeconds);
    if (authCheck.code !== 0) {
      log.write(`\n[${nowIso()}] auth check failed; attempting one login command before running task\n`);
      const authLogin = await runShellStep("auth login", task.authLoginCommand, task.authTimeoutSeconds);
      if (authLogin.code !== 0) {
        await finish(
          "auth_failed",
          `auth failed; task skipped. login code=${authLogin.code} signal=${authLogin.signal || ""}`
        );
        return;
      }

      const authRecheck = await runShellStep("auth recheck", task.authCheckCommand, task.authTimeoutSeconds);
      if (authRecheck.code !== 0) {
        await finish(
          "auth_failed",
          `auth recheck failed; task skipped. recheck code=${authRecheck.code} signal=${authRecheck.signal || ""}`
        );
        return;
      }
    }
  }

  const child = spawn(task.commandTemplate, {
    cwd,
    shell: true,
    env
  });

  running.set(task.id, child);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });

  const timer = setTimeout(() => {
    log.write(`\n[${nowIso()}] timeout after ${task.maxRuntimeMinutes} minutes\n`);
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
  }, timeoutMs);

  child.on("close", async (code, signal) => {
    clearTimeout(timer);
    await finish(code === 0 ? "success" : "failed", `exit code=${code} signal=${signal || ""}`);
  });
}

async function schedulerTick() {
  const tasks = await loadTasks();
  const now = new Date();
  for (const task of tasks) {
    if (dueRunAt(task, now)) runTask(task, "scheduled");
  }
}

setInterval(() => schedulerTick().catch(console.error), 15_000).unref();
schedulerTick().catch(console.error);

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/projects" && req.method === "GET") {
    const projects = await loadProjects();
    return send(res, 200, { projects: sortProjects(projects) });
  }

  if (pathname === "/api/projects" && req.method === "POST") {
    const body = await readJson(req);
    const projects = await loadProjects();
    const project = normalizeProject(body);
    projects.push(project);
    await saveProjects(projects);
    return send(res, 201, { project: projectView(project) });
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && req.method === "PUT") {
    const body = await readJson(req);
    const projects = await loadProjects();
    const idx = projects.findIndex((item) => item.id === projectMatch[1]);
    if (idx === -1) return send(res, 404, { error: "Project not found" });
    projects[idx] = normalizeProject(body, projects[idx]);
    await saveProjects(projects);
    return send(res, 200, { project: projectView(projects[idx]) });
  }

  const pinProjectMatch = pathname.match(/^\/api\/projects\/([^/]+)\/pin$/);
  if (pinProjectMatch && req.method === "POST") {
    const body = await readJson(req);
    const projects = await loadProjects();
    const idx = projects.findIndex((item) => item.id === pinProjectMatch[1]);
    if (idx === -1) return send(res, 404, { error: "Project not found" });
    projects[idx] = normalizeProject(
      {
        ...projects[idx],
        pinned: Boolean(body.pinned),
        sortOrder: body.pinned ? Date.now() : projects[idx].sortOrder
      },
      projects[idx]
    );
    await saveProjects(projects);
    return send(res, 200, { project: projectView(projects[idx]) });
  }

  if (projectMatch && req.method === "DELETE") {
    const projects = await loadProjects();
    const nextProjects = projects.filter((item) => item.id !== projectMatch[1]);
    await saveProjects(nextProjects);

    const tasks = await loadTasks();
    const nextTasks = tasks.map((task) =>
      task.projectId === projectMatch[1] ? { ...task, projectId: "", updatedAt: nowIso() } : task
    );
    await saveTasks(nextTasks);

    return send(res, 200, { ok: true });
  }

  if (pathname === "/api/tasks" && req.method === "GET") {
    const tasks = await loadTasks();
    const projects = await loadProjects();
    return send(res, 200, { tasks: tasks.map((task) => taskView(task, projects)) });
  }

  if (pathname === "/api/tasks" && req.method === "POST") {
    const body = await readJson(req);
    const tasks = await loadTasks();
    const task = normalizeTask(body);
    tasks.push(task);
    await saveTasks(tasks);
    const projects = await loadProjects();
    return send(res, 201, { task: taskView(task, projects) });
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === "PUT") {
    const body = await readJson(req);
    const tasks = await loadTasks();
    const idx = tasks.findIndex((item) => item.id === taskMatch[1]);
    if (idx === -1) return send(res, 404, { error: "Task not found" });
    tasks[idx] = normalizeTask(body, tasks[idx]);
    await saveTasks(tasks);
    const projects = await loadProjects();
    return send(res, 200, { task: taskView(tasks[idx], projects) });
  }

  if (taskMatch && req.method === "DELETE") {
    const tasks = await loadTasks();
    const next = tasks.filter((item) => item.id !== taskMatch[1]);
    await saveTasks(next);
    return send(res, 200, { ok: true });
  }

  const runMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/run$/);
  if (runMatch && req.method === "POST") {
    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === runMatch[1]);
    if (!task) return send(res, 404, { error: "Task not found" });
    await runTask(task, "manual");
    return send(res, 202, { ok: true });
  }

  if (pathname === "/api/logs" && req.method === "GET") {
    const files = await readdir(logDir);
    const logs = await Promise.all(
      files.filter((file) => file.endsWith(".log")).map(async (file) => {
        const info = await stat(path.join(logDir, file));
        return { file, size: info.size, updatedAt: info.mtime.toISOString() };
      })
    );
    logs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return send(res, 200, { logs });
  }

  const logMatch = pathname.match(/^\/api\/logs\/(.+)$/);
  if (logMatch && req.method === "GET") {
    const file = path.basename(decodeURIComponent(logMatch[1]));
    const content = await readFile(path.join(logDir, file), "utf8").catch(() => null);
    if (content === null) return send(res, 404, { error: "Log not found" });
    return send(res, 200, content.slice(-200_000));
  }

  return send(res, 404, { error: "Not found" });
}

async function handleStatic(req, res, pathname) {
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const target = path.normalize(path.join(publicDir, file));
  if (!target.startsWith(publicDir)) return send(res, 403, "Forbidden");
  const content = await readFile(target).catch(() => null);
  if (!content) return send(res, 404, "Not found");
  const ext = path.extname(target);
  const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
  res.end(content);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      await handleStatic(req, res, url.pathname);
    }
  } catch (error) {
    send(res, 500, { error: error.message });
  }
}).listen(port, () => {
  console.log(`Claude task runner listening on http://localhost:${port}`);
});
