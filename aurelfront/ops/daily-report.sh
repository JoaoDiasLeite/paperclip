#!/bin/bash
# Daily token report for AurelFront: yesterday per agent, skipped wakes, and subscription window usage.
# Sends one ntfy notification. Run from cron as the paperclip user.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DB=$(grep ^DATABASE_URL /etc/paperclip/paperclip.env | cut -d= -f2-)
TOPIC=$(cat /etc/paperclip/ntfy-topic)
COMPANY=$(psql "$DB" -tAc "select id from companies order by created_at limit 1")

agents=$(psql "$DB" -tA -f "$HERE/daily-agents.sql")
skipped=$(psql "$DB" -tAc "select count(*) from aurelfront.skipped_wakes where requested_at >= current_date - 1 and requested_at < current_date")
windows=$(/usr/local/bin/pc cost quota-windows -C "$COMPANY" --json 2>/dev/null | python3 "$HERE/quota_windows.py")

msg="Yesterday ($(date -d yesterday +%F))
${agents:-No agent runs.}
Skipped wakes (0 tokens): ${skipped}
${windows}"
curl -fsS -m 20 -H "Title: AurelFront tokens" -d "$msg" "https://ntfy.sh/$TOPIC" >/dev/null
echo "$msg"
