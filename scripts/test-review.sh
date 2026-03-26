#!/bin/bash
# Atherum — Review Test
# Usage: ./scripts/test-review.sh [agents] [rounds]

API="http://localhost:4000"
AGENTS=${1:-3}
ROUNDS=${2:-2}
TMP="/tmp/atherum-test-$$"
mkdir -p $TMP

B="\033[1m"
D="\033[2m"
G="\033[32m"
R="\033[31m"
C="\033[36m"
N="\033[0m"

echo ""
echo -e "${B}ATHERUM REVIEW TEST${N} — $AGENTS agents, $ROUNDS rounds"
echo ""

# Health
curl -sf $API/health > /dev/null || { echo -e "${R}API not running${N}"; exit 1; }
echo -e "${G}API healthy${N}"

# Submit
REVIEW_ID="test_$(date +%s)"
curl -s -X POST $API/api/review \
  -H "Content-Type: application/json" \
  -d "{
    \"content_description\": \"Product photo of a minimalist white sneaker on a concrete surface with dramatic side lighting\",
    \"content_type\": \"image\",
    \"review_id\": \"$REVIEW_ID\",
    \"max_rounds\": $ROUNDS,
    \"agent_count\": $AGENTS
  }" > $TMP/submit.json

echo -e "${G}Submitted${N} — $REVIEW_ID"
echo ""

# Poll
echo -e "${C}Deliberating...${N}"
START=$(date +%s)
while true; do
  curl -s "$API/api/review/$REVIEW_ID/status" > $TMP/result.json
  STATUS=$(python3 -c "import json; print(json.load(open('$TMP/result.json'))['data']['status'])" 2>/dev/null)
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  if [ $ELAPSED -gt 600 ]; then
    echo -e "${R}Timed out after 600s${N}"
    exit 1
  fi
  echo -ne "  ${D}${ELAPSED}s...${N}\r"
  sleep 2
done

echo -e "  Finished in ${B}${ELAPSED}s${N} — status: ${B}$STATUS${N}"
echo ""

if [ "$STATUS" = "failed" ]; then
  python3 -c "import json; d=json.load(open('$TMP/result.json'))['data']; print(f\"Error: {d.get('error','unknown')}\")"
  exit 1
fi

# Print results
python3 << 'PYEOF'
import json

with open("TMPDIR/result.json".replace("TMPDIR", "TMP_PLACEHOLDER")) as f:
    data = json.load(f)["data"]

result = data.get("result", {})
decision = result.get("decision", {})
agents = data.get("agents", [])
journeys = decision.get("agent_journeys", [])

print("\033[1m--- VERDICT ---\033[0m")
print(f"  Score:       {decision.get('approval_score', '?')}/100")
print(f"  Summary:     {decision.get('quick_summary', '?')}")
print(f"  Convergence: {decision.get('convergence_score', 0):.2f}")
print(f"  Confidence:  {decision.get('confidence', 0):.2f}")
print(f"  Rounds:      {decision.get('rounds_taken', '?')}")
print(f"  Agents:      {decision.get('participant_count', '?')}")
print()

import textwrap
print("\033[1m--- POSITION ---\033[0m")
for line in textwrap.wrap(decision.get("winning_position", "N/A"), 72):
    print(f"  {line}")
print()

agreements = decision.get("key_agreements", [])
if agreements:
    print("\033[1m--- AGREEMENTS ---\033[0m")
    for a in agreements:
        print(f"  - {a}")
    print()

dissent = decision.get("remaining_dissent", [])
if dissent:
    print("\033[1m--- DISSENT ---\033[0m")
    for d in dissent:
        print(f"  - {d}")
    print()

print("\033[1m--- AGENTS ---\033[0m")
for agent in agents:
    name = agent.get("name", "?")
    style = agent.get("reasoning_style", "?")
    conf = agent.get("confidence", 0)
    bar = "=" * int(conf * 20) + "-" * (20 - int(conf * 20))
    print(f"  {name:30s} {style:14s} [{bar}] {conf:.0%}")

if journeys:
    print()
    print("\033[1m--- JOURNEYS ---\033[0m")
    for j in journeys:
        name = j.get("agent_name", "?")
        changes = j.get("total_stance_changes", 0)
        consistency = j.get("consistency_score", 0)
        positions = j.get("positions", [])
        print(f"  {name}: {changes} change(s), {consistency:.0%} consistent")
        for p in positions:
            rnd = p.get("round", "?")
            conf = p.get("confidence", 0)
            stance = p.get("stance", "?")[:60]
            print(f"    Round {rnd} ({conf:.0%}): {stance}...")
    print()

print("\033[2mFull result saved to: TMP_PLACEHOLDER/result.json\033[0m")
PYEOF

# Replace placeholder with actual tmp path
python3 -c "
import json
with open('$TMP/result.json') as f:
    data = json.load(f)['data']
result = data.get('result', {})
decision = result.get('decision', {})
agents = data.get('agents', [])
journeys = decision.get('agent_journeys', [])

import textwrap

print('\033[1m--- VERDICT ---\033[0m')
print(f\"  Score:       {decision.get('approval_score', '?')}/100\")
print(f\"  Summary:     {decision.get('quick_summary', '?')}\")
print(f\"  Convergence: {decision.get('convergence_score', 0):.2f}\")
print(f\"  Confidence:  {decision.get('confidence', 0):.2f}\")
print(f\"  Rounds:      {decision.get('rounds_taken', '?')}\")
print(f\"  Agents:      {decision.get('participant_count', '?')}\")
print()

print('\033[1m--- POSITION ---\033[0m')
for line in textwrap.wrap(decision.get('winning_position', 'N/A'), 72):
    print(f'  {line}')
print()

agreements = decision.get('key_agreements', [])
if agreements:
    print('\033[1m--- AGREEMENTS ---\033[0m')
    for a in agreements:
        print(f'  - {a}')
    print()

dissent = decision.get('remaining_dissent', [])
if dissent:
    print('\033[1m--- DISSENT ---\033[0m')
    for d in dissent:
        print(f'  - {d}')
    print()

print('\033[1m--- AGENTS ---\033[0m')
for agent in agents:
    name = agent.get('name', '?')
    style = agent.get('reasoning_style', '?')
    conf = agent.get('confidence', 0)
    bar = '=' * int(conf * 20) + '-' * (20 - int(conf * 20))
    print(f'  {name:30s} {style:14s} [{bar}] {conf:.0%}')

if journeys:
    print()
    print('\033[1m--- JOURNEYS ---\033[0m')
    for j in journeys:
        name = j.get('agent_name', '?')
        changes = j.get('total_stance_changes', 0)
        consistency = j.get('consistency_score', 0)
        positions = j.get('positions', [])
        print(f'  {name}: {changes} change(s), {consistency:.0%} consistent')
        for p in positions:
            rnd = p.get('round', '?')
            conf = p.get('confidence', 0)
            stance = (p.get('stance', '?') or '?')[:60]
            print(f'    Round {rnd} ({conf:.0%}): {stance}...')
    print()

print(f'\033[2mFull result: $TMP/result.json\033[0m')
"

echo ""
