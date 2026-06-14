# Claude Task Runner

本地 Web 配置页 + 定时调度器，用来在人离开电脑时按配置触发 Claude Code 或其他编程命令。

## 启动

```bash
cd /Users/kolar/github/useful/claude-task-runner
npm start
```

打开：

```text
http://localhost:4321
```

## 后台常驻

安装为当前用户的 macOS LaunchAgent：

```bash
cd /Users/kolar/github/useful/claude-task-runner
npm run install-daemon
```

卸载：

```bash
npm run uninstall-daemon
```

LaunchAgent 会保持 Web 配置页和调度器常驻。电脑睡眠时任务不会运行，唤醒后调度器会补跑已经到期但尚未执行的日程。

## 命令模板

默认模板是：

```bash
claude --print "$TASK_PROMPT" --permission-mode acceptEdits
```

如果未来 Claude Code 不再支持 `--print` / `-p`，直接在页面里改成新的非交互调用方式即可。调度器会把任务 prompt 放进环境变量 `TASK_PROMPT`，所以命令模板不需要手动拼接复杂引号。

## 启动前登录检查

任务默认会先在项目目录里执行：

```bash
claude auth status
```

如果检查失败，会在同一个项目目录里执行一次：

```bash
claude
```

然后再次检查登录状态。仍未登录时，任务会被跳过并标记为 `auth_failed`，避免直接进入必失败的编程任务。这个补救命令可以在任务表单里改，例如改成 `claude auth login` 或绝对路径命令。

可用环境变量：

- `TASK_PROMPT`
- `TASK_NAME`
- `TASK_REASON`

## 支持的触发方式

- 仅手动
- 一次性时间
- 每天一个或多个时间点
- 每周指定星期和时间
- 间隔分钟数

## 本地项目

页面里的“本地项目”可以保存多个项目地址。任务可以绑定一个项目，运行时会动态使用该项目的当前路径；如果以后项目路径变化，只需要改项目配置，不需要逐个改任务。

点“同步”会同时扫描 Claude（`~/.claude/projects`）和 Codex（`~/.codex/sessions`）的本地会话历史，按 git 仓库根目录归并成项目，并记录每个项目最近被哪个引擎（Claude / Codex）跑过。项目卡和引擎状态面板会显示这些活跃信息。

常用项目可以勾选“固定为常用项目”，它们会固定显示在项目列表和任务项目下拉框的最前面。适合长期维护、经常跑自动任务的 repo。

任务也保留 `cwd` 作为备用路径。未绑定项目时直接使用这个路径。

项目配置保存在 `data/projects.json`，任务配置保存在 `data/tasks.json`，日志保存在 `logs/`。
