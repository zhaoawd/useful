# keepalive-cc-codex

Keep Claude Code and Codex usage windows warm from a user-level macOS LaunchAgent.

## Files

- `bin/keepalive-cc-codex.sh`: daemon-style zsh script.
- `LaunchAgents/com.kolar.keepalive-cc-codex.plist`: launchd user agent.
- `state-sample/*.next_epoch`: sample runtime state copied from this machine.
- `log-sample/keepalive-cc-codex.tail.log`: recent copied runtime log.

## Runtime Locations

- Script: `/Users/kolar/.local/bin/keepalive-cc-codex.sh`
- LaunchAgent: `/Users/kolar/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist`
- Log: `/Users/kolar/.local/var/log/keepalive-cc-codex.log`
- State: `/Users/kolar/.local/state/keepalive-cc-codex`

## Behavior

The script runs as a long-lived launchd background process. It checks Claude and
Codex independently, then sleeps until the next service is due.

- Successful ping: wait `18060` seconds, or 5h1m.
- Reported session or weekly reset: wait until reset time plus 5 minutes.
- Transient failure: retry after 30 minutes.
- Claude and Codex state files are independent.

## Commands

Install or reload:

```sh
launchctl bootout gui/$(id -u) /Users/kolar/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist 2>/dev/null || true
launchctl bootstrap gui/$(id -u) /Users/kolar/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist
```

Check status:

```sh
launchctl print gui/$(id -u)/com.kolar.keepalive-cc-codex
tail -n 120 /Users/kolar/.local/var/log/keepalive-cc-codex.log
```

## Notes

As of the copied log, Codex succeeds under launchd. Claude succeeds in a normal
terminal with `claude -p`, but launchd/background execution has returned
`Failed to authenticate. API Error: 403 Request not allowed`. Try:

```sh
claude setup-token
```

Then reload or kickstart the LaunchAgent and re-check the log.
