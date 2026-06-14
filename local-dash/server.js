import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const logDir = path.join(__dirname, "logs");
const imagesDir = path.join(dataDir, "images");
const tasksFile = path.join(dataDir, "tasks.json");
const projectsFile = path.join(dataDir, "projects.json");
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4321);
const running = new Map();
const serverStartedAt = nowIso();
const claudeProjectsDir = path.join(os.homedir(), ".claude/projects");
const codexSessionsDir = path.join(os.homedir(), ".codex/sessions");
// Auto-managed projects carry one of these notes; sync may add/remove them freely.
// The first entry is the current sentinel; the rest are kept so older synced rows stay managed.
const SYNC_NOTE = "Synced from local project history";
const SYNC_NOTES = new Set([SYNC_NOTE, "Synced from Claude local project history"]);

// keepalive-cc-codex runtime locations (independent daemon)
const keepaliveStateDir =
  process.env.KEEPALIVE_STATE_DIR || path.join(os.homedir(), ".local/state/keepalive-cc-codex");
const keepaliveLogFile =
  process.env.KEEPALIVE_LOG_FILE || path.join(os.homedir(), ".local/var/log/keepalive-cc-codex.log");

await mkdir(dataDir, { recursive: true });
await mkdir(logDir, { recursive: true });
await mkdir(imagesDir, { recursive: true });
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
    lastClaudeAt: input.lastClaudeAt ?? existing.lastClaudeAt ?? null,
    lastCodexAt: input.lastCodexAt ?? existing.lastCodexAt ?? null,
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function projectView(project) {
  const view = normalizeProject(project, project);
  // Derived for the UI: which engines have touched this project, newest activity first.
  view.engines = [
    view.lastClaudeAt && { engine: "claude", at: view.lastClaudeAt },
    view.lastCodexAt && { engine: "codex", at: view.lastCodexAt }
  ]
    .filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  view.lastActiveAt =
    [view.lastClaudeAt, view.lastCodexAt].filter(Boolean).sort().pop() || null;
  return view;
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

function projectNameFromPath(projectPath) {
  const clean = String(projectPath || "").replace(/\/+$/, "");
  if (!clean || clean === "/") return "root";
  return path.basename(clean);
}

async function gitRoot(startPath) {
  let current = path.resolve(startPath);
  while (current && current !== path.dirname(current)) {
    const marker = await stat(path.join(current, ".git")).catch(() => null);
    if (marker) return current;
    current = path.dirname(current);
  }
  return null;
}

async function discoverClaudeProjects() {
  const dirs = await readdir(claudeProjectsDir, { withFileTypes: true }).catch(() => []);
  const found = new Map();

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(claudeProjectsDir, dir.name);
    const files = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      const filePath = path.join(dirPath, file.name);
      const info = await stat(filePath).catch(() => null);
      const raw = await readFile(filePath, "utf8").catch(() => "");
      if (!raw) continue;

      for (const line of raw.split(/\r?\n/)) {
        if (!line.includes('"cwd"')) continue;
        let item;
        try {
          item = JSON.parse(line);
        } catch {
          continue;
        }
        const cwd = typeof item.cwd === "string" ? item.cwd : "";
        if (!cwd.startsWith("/") || cwd.includes("/.trash/")) continue;
        const exists = await stat(cwd).catch(() => null);
        if (!exists?.isDirectory()) continue;
        const projectPath = await gitRoot(cwd);
        if (!projectPath) continue;
        const latestAt = item.timestamp || info?.mtime?.toISOString() || nowIso();
        const previous = found.get(projectPath);
        if (!previous || String(latestAt) > String(previous.latestAt)) {
          found.set(projectPath, { path: projectPath, latestAt });
        }
      }
    }
  }

  return [...found.values()].sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
}

// Recursively collect Codex rollout session files under ~/.codex/sessions/YYYY/MM/DD/.
async function collectCodexSessionFiles(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectCodexSessionFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

// Codex stores the working directory in the first `session_meta` line of each rollout file.
// The cwd appears before the (large) base instructions, so reading the head of the file is enough.
async function discoverCodexProjects() {
  const files = await collectCodexSessionFiles(codexSessionsDir);
  const found = new Map();

  for (const filePath of files) {
    const fh = await open(filePath, "r").catch(() => null);
    if (!fh) continue;
    try {
      const buf = Buffer.alloc(2048);
      const { bytesRead } = await fh.read(buf, 0, 2048, 0);
      const head = buf.toString("utf8", 0, bytesRead);
      const cwd = head.match(/"cwd":"([^"]*)"/)?.[1] || "";
      if (!cwd.startsWith("/") || cwd === "/" || cwd.includes("/.trash/")) continue;
      const exists = await stat(cwd).catch(() => null);
      if (!exists?.isDirectory()) continue;
      const projectPath = await gitRoot(cwd);
      if (!projectPath) continue;
      const info = await stat(filePath).catch(() => null);
      const latestAt =
        head.match(/"timestamp":"([^"]*)"/)?.[1] || info?.mtime?.toISOString() || nowIso();
      const previous = found.get(projectPath);
      if (!previous || String(latestAt) > String(previous.latestAt)) {
        found.set(projectPath, { path: projectPath, latestAt });
      }
    } finally {
      await fh.close();
    }
  }

  return [...found.values()].sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
}

// Merge Claude + Codex project history into one list, keeping a per-engine "last active" stamp
// so the UI can show which engine touched each project and how recently.
async function discoverAllProjects() {
  const [claude, codex] = await Promise.all([discoverClaudeProjects(), discoverCodexProjects()]);
  const merged = new Map();
  const absorb = (list, key) => {
    for (const item of list) {
      const cur = merged.get(item.path) || { path: item.path, lastClaudeAt: null, lastCodexAt: null };
      if (!cur[key] || String(item.latestAt) > String(cur[key])) cur[key] = item.latestAt;
      merged.set(item.path, cur);
    }
  };
  absorb(claude, "lastClaudeAt");
  absorb(codex, "lastCodexAt");

  for (const entry of merged.values()) {
    entry.latestAt =
      [entry.lastClaudeAt, entry.lastCodexAt].filter(Boolean).sort().pop() || nowIso();
  }
  return [...merged.values()].sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
}

async function syncClaudeProjects() {
  const discovered = await discoverAllProjects();
  const discoveredPaths = new Set(discovered.map((item) => item.path));
  const projects = (await loadProjects()).filter(
    (project) =>
      project.pinned || !SYNC_NOTES.has(project.notes) || discoveredPaths.has(project.path)
  );
  const byPath = new Map(projects.map((project, index) => [project.path, { project, index }]));
  let added = 0;
  let updated = 0;
  const removed = (await loadProjects()).length - projects.length;

  for (const item of discovered) {
    const current = byPath.get(item.path);
    if (current) {
      const existing = current.project;
      const next = normalizeProject(
        {
          ...existing,
          notes: existing.notes || SYNC_NOTE,
          sortOrder: existing.sortOrder || Date.now(),
          lastClaudeAt: item.lastClaudeAt,
          lastCodexAt: item.lastCodexAt
        },
        existing
      );
      if (JSON.stringify(next) !== JSON.stringify(existing)) {
        projects[current.index] = next;
        updated += 1;
      }
      continue;
    }
    projects.push(
      normalizeProject({
        name: projectNameFromPath(item.path),
        path: item.path,
        notes: SYNC_NOTE,
        pinned: false,
        sortOrder: Date.now() + added,
        lastClaudeAt: item.lastClaudeAt,
        lastCodexAt: item.lastCodexAt
      })
    );
    added += 1;
  }

  if (added || updated || removed) await saveProjects(projects);
  return { added, updated, removed, discovered: discovered.length, projects: sortProjects(projects) };
}

// Pick the executor preset from a command template when one isn't stored explicitly
// (keeps tasks created before the executor field was added working).
function inferExecutor(command) {
  const c = String(command || "").trim();
  if (/^codex\b/.test(c)) return "codex";
  if (/^claude\b/.test(c)) return "claude";
  return "custom";
}

const MIME_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp"
};

// Save any newly attached images (sent as base64 data URLs) under data/images/<taskId>/
// and normalize every entry to { name, file } with an absolute path. Entries that already
// carry a file path are kept as-is (an edit that didn't touch the attachments).
async function persistTaskImages(taskId, images) {
  if (!Array.isArray(images)) return [];
  const dir = path.join(imagesDir, taskId);
  const out = [];
  let ensured = false;
  for (const img of images) {
    if (!img) continue;
    if (img.file) {
      out.push({ name: String(img.name || path.basename(img.file)), file: String(img.file) });
      continue;
    }
    if (typeof img.data === "string" && img.data.startsWith("data:")) {
      const m = img.data.match(/^data:([^;]+);base64,(.+)$/s);
      if (!m) continue;
      if (!ensured) {
        await mkdir(dir, { recursive: true });
        ensured = true;
      }
      const base =
        String(img.name || "image")
          .replace(/\.[^.]*$/, "")
          .replace(/[^a-z0-9._-]+/gi, "-")
          .slice(0, 40) || "image";
      const ext = MIME_EXT[m[1]] || path.extname(String(img.name || "")) || ".png";
      const file = path.join(dir, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${base}${ext}`);
      await writeFile(file, Buffer.from(m[2], "base64"));
      out.push({ name: String(img.name || path.basename(file)), file });
    }
  }
  return out;
}

function normalizeTask(input, existing = {}) {
  const schedule = input.schedule || existing.schedule || { type: "manual" };
  const commandTemplate = String(
    input.commandTemplate ||
      existing.commandTemplate ||
      'claude --print "$TASK_PROMPT" --permission-mode acceptEdits'
  ).trim();
  return {
    ...existing,
    id: existing.id || input.id || id(),
    name: String(input.name || existing.name || "Untitled task").trim(),
    projectId: input.projectId ?? existing.projectId ?? "",
    cwd: String(input.cwd || existing.cwd || process.cwd()).trim(),
    prompt: String(input.prompt || existing.prompt || "").trim(),
    executor:
      String(input.executor || existing.executor || inferExecutor(commandTemplate)).trim() || "claude",
    images: (Array.isArray(input.images) ? input.images : existing.images || [])
      .filter((img) => img && img.file)
      .map((img) => ({ name: String(img.name || path.basename(img.file)), file: String(img.file) })),
    commandTemplate,
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
  const imageFiles = (Array.isArray(task.images) ? task.images : []).map((img) => img.file).filter(Boolean);
  // Both Claude Code and Codex can open local image files when their paths appear in the
  // prompt, so we append the attachments to TASK_PROMPT (the raw text stays in TASK_PROMPT_TEXT).
  const prompt = imageFiles.length
    ? `${task.prompt}\n\n[附件图片：请用读取工具查看以下本地图片文件]\n${imageFiles.join("\n")}`
    : task.prompt;
  return {
    ...process.env,
    TASK_PROMPT: prompt,
    TASK_PROMPT_TEXT: task.prompt,
    TASK_IMAGES: imageFiles.join(":"),
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

// Turn a single task log file into a structured run record by reading only its
// head (task/cwd/reason header) and tail (terminal exit line) — logs can be large.
async function parseRunLog(file) {
  const full = path.join(logDir, file);
  const empty = {
    file,
    startedAt: null,
    finishedAt: null,
    taskName: "",
    cwd: "",
    reason: "",
    status: "unknown",
    exitCode: null,
    size: 0
  };
  let info;
  try {
    info = await stat(full);
  } catch {
    return empty;
  }
  let head = "";
  let tail = "";
  const fh = await open(full, "r").catch(() => null);
  if (!fh) return { ...empty, size: info.size };
  try {
    const headLen = Math.min(info.size, 1024);
    if (headLen > 0) {
      const buf = Buffer.alloc(headLen);
      await fh.read(buf, 0, headLen, 0);
      head = buf.toString("utf8");
    }
    const tailLen = Math.min(info.size, 4096);
    if (tailLen > 0) {
      const buf = Buffer.alloc(tailLen);
      await fh.read(buf, 0, tailLen, info.size - tailLen);
      tail = buf.toString("utf8");
    }
  } finally {
    await fh.close();
  }

  const line = (re) => (head.match(re)?.[1] || "").trim();
  const startedAt = line(/^\[([^\]]+)\]\s+task=/m) || null;
  const taskName = line(/\btask=(.*)/);
  const cwd = line(/\bcwd=(.*)/);
  const reason = line(/\breason=(.*)/);

  // Status from the tail: the finish() line has no step label before "exit code".
  let status = "running";
  let exitCode = null;
  let finishedAt = null;
  if (/\]\s+auth (failed|recheck failed); task skipped/.test(tail)) {
    status = "auth_failed";
    finishedAt = tail.match(/\[([^\]]+)\]\s+auth (?:failed|recheck failed); task skipped/)?.[1] || null;
  } else {
    const tailLines = tail.split(/\r?\n/);
    for (let i = tailLines.length - 1; i >= 0; i -= 1) {
      const m = tailLines[i].match(/^\[([^\]]+)\]\s+exit code=(-?\d+)/);
      if (m) {
        finishedAt = m[1];
        exitCode = Number(m[2]);
        status = exitCode === 0 ? "success" : "failed";
        break;
      }
      if (/^\[([^\]]+)\]\s+timeout after /.test(tailLines[i])) {
        finishedAt = tailLines[i].match(/^\[([^\]]+)\]/)?.[1] || null;
        status = "timeout";
        break;
      }
    }
    // No terminal line: still running if the file was touched recently and the
    // task is live, otherwise it was interrupted (server restart, crash, kill).
    if (status === "running") {
      const stale = Date.now() - info.mtime.getTime() > 10 * 60_000;
      if (stale) status = "interrupted";
    }
  }

  return { file, startedAt, finishedAt, taskName, cwd, reason, status, exitCode, size: info.size };
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

// Success interval baked into the keepalive script (5h1m usage window + grace).
const KEEPALIVE_WINDOW_SECONDS = 18060;

// Parse a "YYYY-MM-DD HH:MM:SS" stamp from the log (written in local time) to epoch seconds.
function localStampToEpoch(stamp) {
  const t = Date.parse(String(stamp).replace(" ", "T"));
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

// Classify one ping block into a status + human note from its captured text.
function classifyKeepaliveBlock(exitCode, text) {
  if (/403 Request not allowed/i.test(text)) return { status: "err", note: "403 Request not allowed" };
  // 5h usage window exhausted: the ping exits non-zero but this is expected — quota awaits reset,
  // not a failure. Surface the reset time the CLI prints ("resets 1am (Asia/Shanghai)").
  if (/hit your (?:session|usage) limit|(?:session|usage) limit\b/i.test(text)) {
    const reset = text.match(/resets?\s+(.+?)\s*$/im);
    return { status: "limit", note: reset ? `额度用完 · ${reset[1].trim()} 重置` : "额度用完待重置" };
  }
  if (exitCode === 124) return { status: "warn", note: "超时 (124)" };
  if (/stream disconnected|Reconnecting\.\.\./i.test(text) && exitCode !== 0)
    return { status: "warn", note: "websocket 重连失败" };
  if (exitCode !== 0) return { status: "warn", note: `exit=${exitCode}` };
  return { status: "ok", note: "" };
}

// Walk the keepalive log into per-service session records (one per real ping, newest first).
// A "session" = one keepalive ping that renews that service's 5h usage window. Each carries
// its time point, elapsed, token usage (codex prints it), status, and the scheduled next window.
function parseKeepaliveSessions(lines) {
  const out = { claude: [], codex: [] };
  let cycleEpoch = null;
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const block = cur;
    cur = null;
    const text = block.buf.join("\n");
    if (/^\s*skip:/m.test(text)) return; // skipped (still inside its window) — not a real ping
    const exit = text.match(new RegExp(`\\[${block.service}[^\\]]*exit=(-?\\d+) elapsed=(\\d+)s\\]`));
    if (!exit) return; // truncated block (log tail cut mid-write)
    const exitCode = Number(exit[1]);
    const elapsedSeconds = Number(exit[2]);

    let tokens = null;
    const tokenMatches = [...text.matchAll(/tokens used\s*\n\s*([\d,]+)/g)];
    if (tokenMatches.length) tokens = Number(tokenMatches[tokenMatches.length - 1][1].replace(/,/g, ""));

    const { status, note } = classifyKeepaliveBlock(exitCode, text);

    let reason = "";
    let nextEpoch = null;
    const nx = text.match(/next:\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+after\s+(.*)/);
    if (nx) {
      nextEpoch = localStampToEpoch(nx[1]);
      reason = /successful/.test(nx[2]) ? "success" : /reported reset/.test(nx[2]) ? "reset" : "retry";
    }

    out[block.service].push({
      at: block.at ? new Date(block.at * 1000).toISOString() : null,
      epoch: block.at,
      variant: block.variant,
      exitCode,
      elapsedSeconds,
      tokens,
      status,
      note,
      reason,
      nextEpoch
    });
  };

  for (const line of lines) {
    const cy = line.match(/^=== (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) keepalive start ===/);
    if (cy) {
      cycleEpoch = localStampToEpoch(cy[1]);
      continue;
    }
    const hdr = line.match(/^--- (claude|codex)(?: \(([^)]*)\))? ---/);
    if (hdr) {
      flush();
      cur = { service: hdr[1], variant: hdr[2] || null, at: cycleEpoch, buf: [] };
      continue;
    }
    if (/^=== .* keepalive done ===/.test(line) || /^sleep:/.test(line)) {
      flush();
      continue;
    }
    if (cur) cur.buf.push(line);
  }
  flush();

  for (const key of ["claude", "codex"]) {
    out[key] = out[key].filter((s) => s.at).reverse().slice(0, 15); // newest first
  }
  return out;
}

// Aggregate anomaly + usage signals over a service's recent sessions (newest first).
function keepaliveStats(sessions) {
  let failStreak = 0;
  for (const s of sessions) {
    // "limit" (quota awaiting reset) is an expected state, not a failure — it breaks the streak.
    if (s.status === "ok" || s.status === "limit") break;
    failStreak += 1;
  }
  const tokenList = sessions.filter((s) => s.tokens != null).map((s) => s.tokens);
  const totalTokens = tokenList.reduce((a, b) => a + b, 0);
  const lastOk = sessions.find((s) => s.status === "ok") || null;
  return {
    count: sessions.length,
    ok: sessions.filter((s) => s.status === "ok").length,
    warn: sessions.filter((s) => s.status === "warn").length,
    err: sessions.filter((s) => s.status === "err").length,
    limit: sessions.filter((s) => s.status === "limit").length,
    failStreak,
    totalTokens,
    avgTokens: tokenList.length ? Math.round(totalTokens / tokenList.length) : null,
    lastSuccessAt: lastOk ? lastOk.at : null
  };
}

async function readKeepaliveState() {
  const readEpoch = async (name) => {
    const raw = await readFile(path.join(keepaliveStateDir, name), "utf8").catch(() => null);
    if (raw === null) return null;
    const n = Number(String(raw).trim());
    return Number.isFinite(n) ? n : null;
  };

  // Only the tail matters for recent sessions; bound the read for large logs.
  const logRaw = await readFile(keepaliveLogFile, "utf8").catch(() => null);
  const logTail = logRaw ? logRaw.slice(-400_000) : null;
  const lines = logTail ? logTail.split(/\r?\n/) : [];
  const parsed = parseKeepaliveSessions(lines);

  const [claudeEpoch, codexEpoch] = await Promise.all([
    readEpoch("claude.next_epoch"),
    readEpoch("codex.next_epoch")
  ]);

  const buildService = (service, nextEpoch) => {
    const sessions = parsed[service] || [];
    const stats = keepaliveStats(sessions);
    const latest = sessions[0] || null;
    return {
      status: latest ? latest.status : "idle",
      exitCode: latest ? latest.exitCode : null,
      variant: latest ? latest.variant : null,
      note: latest ? latest.note : "",
      elapsedSeconds: latest ? latest.elapsedSeconds : null,
      tokens: latest ? latest.tokens : null,
      nextEpoch,
      windowSeconds: KEEPALIVE_WINDOW_SECONDS,
      lastSuccessAt: stats.lastSuccessAt,
      sessions,
      stats
    };
  };

  return {
    available: Boolean(logTail) || claudeEpoch !== null,
    logFile: keepaliveLogFile,
    stateDir: keepaliveStateDir,
    windowSeconds: KEEPALIVE_WINDOW_SECONDS,
    services: {
      claude: buildService("claude", claudeEpoch),
      codex: buildService("codex", codexEpoch)
    }
  };
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/keepalive" && req.method === "GET") {
    const state = await readKeepaliveState().catch(() => ({ available: false, services: {} }));
    return send(res, 200, state);
  }

  const keepaliveLogMatch = pathname === "/api/keepalive/log" && req.method === "GET";
  if (keepaliveLogMatch) {
    const content = await readFile(keepaliveLogFile, "utf8").catch(() => null);
    if (content === null) return send(res, 404, "keepalive log not found");
    return send(res, 200, content.slice(-200_000));
  }

  if (pathname === "/api/system" && req.method === "GET") {
    const tasks = await loadTasks();
    const projectViews = (await loadProjects()).map(projectView);
    const engineActivity = (stampKey, executor) => {
      const stamps = projectViews.map((p) => p[stampKey]).filter(Boolean).sort();
      return {
        activeProjects: stamps.length,
        lastActiveAt: stamps[stamps.length - 1] || null,
        taskCount: tasks.filter((t) => (t.executor || "claude") === executor).length
      };
    };
    return send(res, 200, {
      port,
      startedAt: serverStartedAt,
      now: nowIso(),
      runningCount: running.size,
      taskCount: tasks.length,
      enabledCount: tasks.filter((t) => t.enabled).length,
      projectCount: projectViews.length,
      engines: {
        claude: engineActivity("lastClaudeAt", "claude"),
        codex: engineActivity("lastCodexAt", "codex")
      }
    });
  }

  if (pathname === "/api/projects" && req.method === "GET") {
    const projects = await loadProjects();
    return send(res, 200, { projects: sortProjects(projects) });
  }

  if (pathname === "/api/projects/sync" && req.method === "POST") {
    const result = await syncClaudeProjects();
    return send(res, 200, result);
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
    const taskId = body.id || id();
    body.images = await persistTaskImages(taskId, body.images);
    const task = normalizeTask({ ...body, id: taskId });
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
    body.images = await persistTaskImages(taskMatch[1], body.images);
    tasks[idx] = normalizeTask(body, tasks[idx]);
    await saveTasks(tasks);
    const projects = await loadProjects();
    return send(res, 200, { task: taskView(tasks[idx], projects) });
  }

  if (taskMatch && req.method === "DELETE") {
    const tasks = await loadTasks();
    const next = tasks.filter((item) => item.id !== taskMatch[1]);
    await saveTasks(next);
    await rm(path.join(imagesDir, taskMatch[1]), { recursive: true, force: true }).catch(() => {});
    return send(res, 200, { ok: true });
  }

  const taskImgMatch = pathname.match(/^\/api\/task-images\/([^/]+)\/(.+)$/);
  if (taskImgMatch && req.method === "GET") {
    const dir = path.join(imagesDir, path.basename(decodeURIComponent(taskImgMatch[1])));
    const file = path.normalize(path.join(dir, path.basename(decodeURIComponent(taskImgMatch[2]))));
    if (!file.startsWith(dir)) return send(res, 403, "Forbidden");
    const content = await readFile(file).catch(() => null);
    if (!content) return send(res, 404, { error: "Image not found" });
    const ext = path.extname(file).toLowerCase();
    const type =
      { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" }[
        ext
      ] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    return res.end(content);
  }

  const runMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/run$/);
  if (runMatch && req.method === "POST") {
    const tasks = await loadTasks();
    const task = tasks.find((item) => item.id === runMatch[1]);
    if (!task) return send(res, 404, { error: "Task not found" });
    await runTask(task, "manual");
    return send(res, 202, { ok: true });
  }

  if (pathname === "/api/runs" && req.method === "GET") {
    const files = await readdir(logDir).catch(() => []);
    const parsed = await Promise.all(
      files.filter((file) => file.endsWith(".log")).map((file) => parseRunLog(file))
    );
    // Drop daemon/non-task logs (those have no task header → no startedAt).
    const runs = parsed.filter((run) => run.startedAt);
    runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    return send(res, 200, { runs });
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
  res.writeHead(200, {
    "content-type": `${type}; charset=utf-8`,
    // Local dashboard: always revalidate so UI edits show up without a hard refresh.
    "cache-control": "no-cache, must-revalidate"
  });
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
