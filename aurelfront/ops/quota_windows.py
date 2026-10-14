"""Print one line per subscription usage window from `paperclipai cost quota-windows --json`."""
import json
import sys

try:
    providers = json.load(sys.stdin)
except ValueError:
    sys.exit(0)

for provider in providers:
    for window in provider.get("windows", []):
        if window.get("usedPercent") is not None:
            print(f"{provider['provider']} {window['label']}: {window['usedPercent']}%")
