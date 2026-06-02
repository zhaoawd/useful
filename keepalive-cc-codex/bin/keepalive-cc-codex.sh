#!/bin/zsh
# Periodically ping Claude Code and Codex just after their 5h usage windows reset.
# Triggered by ~/Library/LaunchAgents/com.kolar.keepalive-cc-codex.plist.

set -u

LOG_DIR="$HOME/.local/var/log"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/keepalive-cc-codex.log"

STATE_DIR="$HOME/.local/state/keepalive-cc-codex"
mkdir -p "$STATE_DIR"

SUCCESS_INTERVAL_SECONDS=18060
LIMIT_RESET_GRACE_SECONDS=300
RETRY_AFTER_FAILURE_SECONDS=1800

# Make sure CLI paths are visible under launchd's minimal PATH.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
epoch_ts() { date -r "$1" '+%Y-%m-%d %H:%M:%S'; }

TIMEOUT_CMD="$(command -v timeout || command -v gtimeout || true)"

run_with_timeout() {
  local limit="$1"
  shift

  if [[ -n "$TIMEOUT_CMD" ]]; then
    "$TIMEOUT_CMD" "$limit" "$@" </dev/null
    return $?
  fi

  local pid deadline
  "$@" </dev/null &
  pid=$!
  deadline=$((SECONDS + limit))

  while kill -0 "$pid" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      kill "$pid" 2>/dev/null
      sleep 2
      kill -9 "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
      return 124
    fi
    sleep 1
  done

  wait "$pid"
}

run_ping() {
  local service="$1"
  local name="$2"
  local next_file="$STATE_DIR/$service.next_epoch"
  shift
  shift

  local now next_due
  now="$(date +%s)"

  if [[ -f "$next_file" ]]; then
    next_due="$(<"$next_file")"
    if [[ "$next_due" == <-> && "$now" -lt "$next_due" ]]; then
      echo "--- $name ---"
      echo "skip: next attempt at $(epoch_ts "$next_due")"
      return
    fi
  fi

  local started ended exit_code output_file reset_epoch next_epoch
  started="$(date +%s)"
  output_file="$(mktemp "$STATE_DIR/$service.output.XXXXXX")"

  echo "--- $name ---"
  echo "path: $1 -> $(command -v "$1" || echo "not found")"

  run_with_timeout 120 "$@" >"$output_file" 2>&1
  exit_code=$?
  cat "$output_file"
  ended="$(date +%s)"
  echo "[$name exit=$exit_code elapsed=$((ended - started))s]"

  if [[ "$exit_code" -eq 0 ]]; then
    next_epoch=$((ended + SUCCESS_INTERVAL_SECONDS))
    echo "$next_epoch" >"$next_file"
    echo "next: $(epoch_ts "$next_epoch") after successful ping"
  elif reset_epoch="$(parse_reset_epoch "$output_file")" && [[ -n "$reset_epoch" ]]; then
    next_epoch=$((reset_epoch + LIMIT_RESET_GRACE_SECONDS))
    echo "$next_epoch" >"$next_file"
    echo "next: $(epoch_ts "$next_epoch") after reported reset"
  else
    next_epoch=$((ended + RETRY_AFTER_FAILURE_SECONDS))
    echo "$next_epoch" >"$next_file"
    echo "next: $(epoch_ts "$next_epoch") after transient failure"
  fi

  rm -f "$output_file"
}

parse_reset_epoch() {
  local output_file="$1"
  local reset_text raw today candidate compact weekday target_day current_day delta base_date time_text

  reset_text="$(grep -Eio 'resets([[:space:]]+at)?[[:space:]]+[^()[:cntrl:]]+' "$output_file" | tail -n 1 | sed -E 's/^resets([[:space:]]+at)?[[:space:]]+//; s/[[:space:]]+$//')"
  [[ -n "$reset_text" ]] || return 1

  raw="$(echo "$reset_text" | tr '[:upper:]' '[:lower:]' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"
  compact="$(echo "$raw" | sed -E 's/[[:space:]]+//g')"
  today="$(date '+%Y-%m-%d')"

  candidate="$(date -j -f '%Y-%m-%d %I:%M%p' "$today $compact" '+%s' 2>/dev/null || true)"
  if [[ -n "$candidate" ]]; then
    if [[ "$candidate" -le "$(date +%s)" ]]; then
      candidate=$((candidate + 86400))
    fi
    echo "$candidate"
    return 0
  fi

  candidate="$(date -j -f '%Y-%m-%d %H:%M' "$today $compact" '+%s' 2>/dev/null || true)"
  if [[ -n "$candidate" ]]; then
    if [[ "$candidate" -le "$(date +%s)" ]]; then
      candidate=$((candidate + 86400))
    fi
    echo "$candidate"
    return 0
  fi

  for fmt in '%Y-%m-%d %I:%M%p' '%Y-%m-%d %H:%M' '%m/%d/%Y %I:%M%p' '%m/%d/%Y %H:%M' '%b %d %Y %I:%M%p' '%b %d %Y %H:%M'; do
    candidate="$(date -j -f "$fmt" "$raw" '+%s' 2>/dev/null || true)"
    if [[ -n "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  weekday="$(echo "$raw" | grep -Eio 'monday|tuesday|wednesday|thursday|friday|saturday|sunday' | head -n 1 || true)"
  time_text="$(echo "$raw" | grep -Eio '[0-9]{1,2}:[0-9]{2}[[:space:]]*(am|pm)?' | tail -n 1 | sed -E 's/[[:space:]]+//g' || true)"
  if [[ -n "$weekday" && -n "$time_text" ]]; then
    case "$weekday" in
      monday) target_day=1 ;;
      tuesday) target_day=2 ;;
      wednesday) target_day=3 ;;
      thursday) target_day=4 ;;
      friday) target_day=5 ;;
      saturday) target_day=6 ;;
      sunday) target_day=7 ;;
    esac
    current_day="$(date '+%u')"
    delta=$(((target_day - current_day + 7) % 7))
    base_date="$(date -v+"$delta"d '+%Y-%m-%d')"
    candidate="$(date -j -f '%Y-%m-%d %I:%M%p' "$base_date $time_text" '+%s' 2>/dev/null || true)"
    if [[ -z "$candidate" ]]; then
      candidate="$(date -j -f '%Y-%m-%d %H:%M' "$base_date $time_text" '+%s' 2>/dev/null || true)"
    fi
    if [[ -n "$candidate" ]]; then
      if [[ "$candidate" -le "$(date +%s)" ]]; then
        candidate=$((candidate + 604800))
      fi
      echo "$candidate"
      return 0
    fi
  fi

  return 1
}

next_attempt_epoch() {
  local now min_epoch service file value
  now="$(date +%s)"
  min_epoch=0

  for service in claude codex; do
    file="$STATE_DIR/$service.next_epoch"
    if [[ ! -f "$file" ]]; then
      echo "$now"
      return
    fi

    value="$(<"$file")"
    if [[ "$value" != <-> || "$value" -le "$now" ]]; then
      echo "$now"
      return
    fi

    if [[ "$min_epoch" -eq 0 || "$value" -lt "$min_epoch" ]]; then
      min_epoch="$value"
    fi
  done

  echo "$min_epoch"
}

sleep_until_next_attempt() {
  local now target delay
  now="$(date +%s)"
  target="$(next_attempt_epoch)"
  delay=$((target - now))
  if [[ "$delay" -lt 60 ]]; then
    delay=60
    target=$((now + delay))
  fi

  echo "sleep: until $(epoch_ts "$target") (${delay}s)"
  sleep "$delay"
}

run_cycle() {
  echo "=== $(ts) keepalive start ==="
  echo "timeout: ${TIMEOUT_CMD:-zsh fallback}"

  run_ping "claude" "claude (haiku)" claude -p "hi" --model haiku --max-turns 1
  run_ping "codex" "codex (gpt-5.4, low effort)" codex exec -m gpt-5.4 \
    -c model_reasoning_effort=low --skip-git-repo-check "hi"

  echo "=== $(ts) keepalive done ==="
  echo
}

while true; do
  {
    run_cycle
    sleep_until_next_attempt
  } >>"$LOG" 2>&1
done
