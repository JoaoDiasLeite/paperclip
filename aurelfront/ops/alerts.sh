#!/bin/bash
# Push budget incidents and quota-guard deferrals to ntfy. Run every 10 minutes from cron
# as the paperclip user; remembers the last run in $STATE so each event is sent once.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DB=$(grep ^DATABASE_URL /etc/paperclip/paperclip.env | cut -d= -f2-)
TOPIC=$(cat /etc/paperclip/ntfy-topic)
STATE=/opt/paperclip/data/alerts.last-run

now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
since=$(cat "$STATE" 2>/dev/null || echo "$now")

events=$(psql "$DB" -tA -v since="$since" -f "$HERE/alerts.sql") || exit 1
echo "$now" > "$STATE"
[ -z "$events" ] && exit 0

priority=default
grep -q "HARD STOP" <<<"$events" && priority=high
curl -fsS -m 20 -H "Title: AurelFront limits" -H "Priority: $priority" -d "$events" "https://ntfy.sh/$TOPIC" >/dev/null
echo "$now sent: $events"
