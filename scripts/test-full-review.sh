#!/bin/bash
# Atherum — Full Review Pipeline Test
# Tests the complete content review flow end-to-end

API="http://localhost:4000"
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}ATHERUM — Full Review Pipeline Test${RESET}"
echo -e "${DIM}Testing: Submit → Deliberate → Converge → Verdict${RESET}"
echo ""

# ─── Test 1: Health Check ────────────────────────────────────────────
echo -e "${CYAN}[1/6] Health Check${RESET}"
HEALTH=$(curl -s $API/health)
STATUS=$(echo $HEALTH | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
if [ "$STATUS" = "ok" ]; then
  echo -e "  ${GREEN}PASS${RESET} — API is healthy"
else
  echo -e "  ${RED}FAIL${RESET} — API not responding"
  exit 1
fi
echo ""

# ─── Test 2: Submit Review (3 agents, 2 rounds — fast test) ─────────
echo -e "${CYAN}[2/6] Submitting review (3 agents, 2 rounds)${RESET}"
SUBMIT=$(curl -s -X POST $API/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "content_description": "Product photo of a minimalist white sneaker on a concrete surface with dramatic side lighting and shallow depth of field",
    "content_type": "image",
    "review_id": "test_e2e_'$(date +%s)'",
    "max_rounds": 2,
    "agent_count": 3
  }')

REVIEW_ID=$(echo $SUBMIT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['review_id'])" 2>/dev/null)
SESSION_ID=$(echo $SUBMIT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['session_id'])" 2>/dev/null)
SUCCESS=$(echo $SUBMIT | python3 -c "import sys,json; print(json.load(sys.stdin)['success'])" 2>/dev/null)

if [ "$SUCCESS" = "True" ]; then
  echo -e "  ${GREEN}PASS${RESET} — Review submitted"
  echo -e "  ${DIM}Review ID:  $REVIEW_ID${RESET}"
  echo -e "  ${DIM}Session ID: $SESSION_ID${RESET}"
else
  echo -e "  ${RED}FAIL${RESET} — Submit failed"
  echo "  $SUBMIT"
  exit 1
fi
echo ""

# ─── Test 3: Poll for completion ─────────────────────────────────────
echo -e "${CYAN}[3/6] Waiting for deliberation to complete${RESET}"
MAX_POLLS=60
POLL=0
STATUS="processing"

while [ "$STATUS" != "completed" ] && [ "$STATUS" != "failed" ] && [ $POLL -lt $MAX_POLLS ]; do
  sleep 2
  POLL=$((POLL + 1))
  RESULT=$(curl -s $API/api/review/$REVIEW_ID/status)
  STATUS=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null)
  ELAPSED=$((POLL * 2))
  echo -ne "  ${DIM}Polling... ${ELAPSED}s (status: $STATUS)${RESET}\r"
done
echo ""

if [ "$STATUS" = "completed" ]; then
  echo -e "  ${GREEN}PASS${RESET} — Deliberation completed in ~${ELAPSED}s"
else
  echo -e "  ${RED}FAIL${RESET} — Status: $STATUS"
  ERROR=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('error','unknown'))" 2>/dev/null)
  echo -e "  ${DIM}Error: $ERROR${RESET}"
  exit 1
fi
echo ""

# ─── Test 4: Validate decision structure ─────────────────────────────
echo -e "${CYAN}[4/6] Validating decision structure${RESET}"

python3 << PYEOF
import json, sys

data = json.loads('''$RESULT''')['data']
result = data.get('result', {})
decision = result.get('decision', {})
agents = data.get('agents', [])

checks = []

# Check decision fields exist
for field in ['winning_position', 'convergence_score', 'confidence', 'consensus_summary',
              'key_agreements', 'remaining_dissent', 'minority_report', 'approval_score',
              'quick_summary', 'rounds_taken', 'participant_count', 'agent_journeys']:
    present = field in decision
    checks.append((field, present))

# Check agents
checks.append(('agents_count', len(agents) == 3))

# Check agent fields
if agents:
    a = agents[0]
    for f in ['agent_id', 'name', 'reasoning_style', 'persona']:
        checks.append((f'agent.{f}', f in a))

# Check convergence is valid
conv = decision.get('convergence_score', 0)
checks.append(('convergence_in_range', 0 <= conv <= 1))

# Check approval score is valid
score = decision.get('approval_score', -1)
checks.append(('approval_score_in_range', 0 <= score <= 100))

# Print results
passed = 0
failed = 0
for name, ok in checks:
    if ok:
        print(f"  \033[32mPASS\033[0m — {name}")
        passed += 1
    else:
        print(f"  \033[31mFAIL\033[0m — {name}")
        failed += 1

print(f"\n  {passed}/{passed+failed} checks passed")
sys.exit(0 if failed == 0 else 1)
PYEOF
echo ""

# ─── Test 5: Print the verdict ───────────────────────────────────────
echo -e "${CYAN}[5/6] Review Verdict${RESET}"
python3 << PYEOF
import json

data = json.loads('''$RESULT''')['data']
result = data.get('result', {})
decision = result.get('decision', {})
agents = data.get('agents', [])

print(f"  \033[1mApproval Score:\033[0m {decision.get('approval_score', '?')}/100")
print(f"  \033[1mQuick Summary:\033[0m {decision.get('quick_summary', '?')}")
print(f"  \033[1mConvergence:\033[0m {decision.get('convergence_score', 0):.2f}")
print(f"  \033[1mConfidence:\033[0m {decision.get('confidence', 0):.2f}")
print(f"  \033[1mRounds:\033[0m {decision.get('rounds_taken', '?')}")
print(f"  \033[1mAgents:\033[0m {decision.get('participant_count', '?')}")
print()
print(f"  \033[1mWinning Position:\033[0m")
pos = decision.get('winning_position', 'N/A')
# Word wrap at 70 chars
import textwrap
for line in textwrap.wrap(pos, 70):
    print(f"    {line}")
print()

agreements = decision.get('key_agreements', [])
if agreements:
    print(f"  \033[1mKey Agreements:\033[0m")
    for a in agreements:
        print(f"    - {a}")
    print()

dissent = decision.get('remaining_dissent', [])
if dissent:
    print(f"  \033[1mDissent:\033[0m")
    for d in dissent:
        print(f"    - {d}")
    print()

print(f"  \033[1mAgent Reactions:\033[0m")
for agent in agents:
    style = agent.get('reasoning_style', '?')
    name = agent.get('name', '?')
    conf = agent.get('confidence', 0)
    print(f"    {name} ({style}) — confidence: {conf:.0%}")

journeys = decision.get('agent_journeys', [])
if journeys:
    print()
    print(f"  \033[1mAgent Journeys:\033[0m")
    for j in journeys:
        changes = j.get('total_stance_changes', 0)
        consistency = j.get('consistency_score', 0)
        name = j.get('agent_name', '?')
        print(f"    {name}: {changes} stance change(s), {consistency:.0%} consistency")
PYEOF
echo ""

# ─── Test 6: Full 10-agent review ────────────────────────────────────
echo -e "${CYAN}[6/6] Submitting full 10-agent review (3 rounds)${RESET}"
echo -e "  ${DIM}This takes 30-60 seconds...${RESET}"

FULL_SUBMIT=$(curl -s -X POST $API/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "content_description": "Instagram carousel first slide: overhead flatlay of a complete skincare routine — cleanser, toner, serum, moisturizer, and SPF arranged in a diagonal line on a marble surface with fresh eucalyptus sprigs and morning light casting soft shadows",
    "content_type": "image",
    "review_id": "test_full_'$(date +%s)'",
    "max_rounds": 3,
    "agent_count": 10
  }')

FULL_ID=$(echo $FULL_SUBMIT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['review_id'])" 2>/dev/null)
echo -e "  ${GREEN}Submitted${RESET} — Review ID: $FULL_ID"

POLL=0
STATUS="processing"
while [ "$STATUS" != "completed" ] && [ "$STATUS" != "failed" ] && [ $POLL -lt 90 ]; do
  sleep 3
  POLL=$((POLL + 1))
  FULL_RESULT=$(curl -s $API/api/review/$FULL_ID/status)
  STATUS=$(echo $FULL_RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null)
  ELAPSED=$((POLL * 3))
  echo -ne "  ${DIM}Deliberating... ${ELAPSED}s (status: $STATUS)${RESET}\r"
done
echo ""

if [ "$STATUS" = "completed" ]; then
  echo -e "  ${GREEN}PASS${RESET} — Full review completed in ~${ELAPSED}s"
  python3 << PYEOF2
import json
data = json.loads('''$FULL_RESULT''')['data']
decision = data.get('result', {}).get('decision', {})
agents = data.get('agents', [])
print(f"  \033[1mScore:\033[0m {decision.get('approval_score', '?')}/100")
print(f"  \033[1mSummary:\033[0m {decision.get('quick_summary', '?')}")
print(f"  \033[1mConvergence:\033[0m {decision.get('convergence_score', 0):.2f}")
print(f"  \033[1mAgents:\033[0m {len(agents)}")
print(f"  \033[1mRounds:\033[0m {decision.get('rounds_taken', '?')}")
PYEOF2
else
  echo -e "  ${RED}FAIL${RESET} — Status: $STATUS"
  ERROR=$(echo $FULL_RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('error','unknown'))" 2>/dev/null)
  echo -e "  ${DIM}Error: $ERROR${RESET}"
fi

echo ""
echo -e "${BOLD}Test suite complete.${RESET}"
echo ""
