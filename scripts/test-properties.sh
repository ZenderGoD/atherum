#!/bin/bash
# Atherum Property-Based Tests
# Tests invariants that should ALWAYS hold regardless of input

API="https://next-okapi-818.convex.site"
PASS=0
FAIL=0
TOTAL=0
TMP="/tmp/atherum-props-$$"
mkdir -p $TMP

B="\033[1m"
G="\033[32m"
R="\033[31m"
D="\033[2m"
N="\033[0m"

check() {
  TOTAL=$((TOTAL + 1))
  if [ "$2" = "true" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${G}PASS${N}  $1"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${R}FAIL${N}  $1"
  fi
}

submit_and_wait() {
  local desc="$1"
  local agents="$2"
  local rounds="$3"
  local id="prop_${RANDOM}_$(date +%s)"

  curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
    \"content_description\": \"$desc\",
    \"content_type\": \"image\",
    \"review_id\": \"$id\",
    \"max_rounds\": $rounds,
    \"agent_count\": $agents
  }" > /dev/null

  local start=$(date +%s)
  while true; do
    curl -s "$API/api/review/$id/status" > "$TMP/$id.json" 2>/dev/null
    local status=$(python3 -c "import json; print(json.load(open('$TMP/$id.json'))['data']['status'])" 2>/dev/null)
    if [ "$status" = "completed" ] || [ "$status" = "failed" ]; then
      echo "$id"
      return
    fi
    local now=$(date +%s)
    if [ $((now - start)) -gt 180 ]; then
      echo "$id"
      return
    fi
    sleep 3
  done
}

echo ""
echo -e "${B}ATHERUM PROPERTY-BASED TESTS${N}"
echo -e "${D}Testing invariants that must always hold${N}"
echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[1] Convergence Properties${N}"
# ═══════════════════════════════════════════════════════════════════════

echo -e "${D}  Running 2 reviews to test convergence properties...${N}"
ID1=$(submit_and_wait "Luxury watch macro photo on black velvet with dramatic lighting" 3 2)
ID2=$(submit_and_wait "Children's colorful cartoon illustration of a happy dog in a park" 3 2)

python3 << PYEOF
import json, sys

results = []
for fid in ["$ID1", "$ID2"]:
    try:
        data = json.load(open(f"$TMP/{fid}.json"))["data"]
        status = data.get("status", "unknown")
        if status == "completed":
            decision = data.get("result", {}).get("decision", {})
            results.append({
                "id": fid,
                "convergence": decision.get("convergence_score", -1),
                "approval": decision.get("approval_score", -1),
                "confidence": decision.get("confidence", -1),
                "rounds": decision.get("rounds_taken", 0),
                "participants": decision.get("participant_count", 0),
                "agreements": len(decision.get("key_agreements", [])),
                "journeys": decision.get("agent_journeys", []),
            })
    except Exception as e:
        pass

if not results:
    print("convergence_in_range:false")
    print("approval_in_range:false")
    print("confidence_in_range:false")
    print("has_agreements:false")
    print("journeys_match_agents:false")
    print("different_content_different_scores:false")
    sys.exit(0)

for r in results:
    # Property: convergence is always in [0, 1]
    c = r["convergence"]
    in_range = 0 <= c <= 1 if isinstance(c, (int, float)) else False

    # Property: approval score is always in [0, 100]
    a = r["approval"]
    a_range = 0 <= a <= 100 if isinstance(a, (int, float)) else False

    # Property: confidence is always in [0, 1]
    conf = r["confidence"]
    c_range = 0 <= conf <= 1 if isinstance(conf, (int, float)) else False

print(f"convergence_in_range:{'true' if all(0 <= r['convergence'] <= 1 for r in results) else 'false'}")
print(f"approval_in_range:{'true' if all(0 <= r['approval'] <= 100 for r in results) else 'false'}")
print(f"confidence_in_range:{'true' if all(0 <= r['confidence'] <= 1 for r in results) else 'false'}")
print(f"has_agreements:{'true' if all(r['agreements'] > 0 for r in results) else 'false'}")
print(f"journeys_match_agents:{'true' if all(len(r['journeys']) == r['participants'] for r in results) else 'false'}")

# Property: different content should produce different approval scores (not identical)
if len(results) >= 2:
    same = results[0]["approval"] == results[1]["approval"]
    print(f"different_content_different_scores:{'true' if not same else 'false'}")
else:
    print("different_content_different_scores:true")
PYEOF

python3 -c "
import sys
for line in sys.stdin:
    line = line.strip()
    if ':' in line:
        name, result = line.rsplit(':', 1)
        print(f'{name}:{result}')
" < /dev/null

# Read from the python output above
python3 << PYEOF2
import json

results = []
for fid in ["$ID1", "$ID2"]:
    try:
        data = json.load(open(f"$TMP/{fid}.json"))["data"]
        if data.get("status") == "completed":
            decision = data.get("result", {}).get("decision", {})
            results.append(decision)
    except:
        pass

checks = []

# All convergence scores in [0, 1]
checks.append(("convergence_always_in_0_1", all(0 <= d.get("convergence_score", -1) <= 1 for d in results) if results else False))

# All approval scores in [0, 100]
checks.append(("approval_always_in_0_100", all(0 <= d.get("approval_score", -1) <= 100 for d in results) if results else False))

# All confidence in [0, 1]
checks.append(("confidence_always_in_0_1", all(0 <= d.get("confidence", -1) <= 1 for d in results) if results else False))

# Every review has at least 1 key agreement
checks.append(("always_has_agreements", all(len(d.get("key_agreements", [])) > 0 for d in results) if results else False))

# Every review has a non-empty winning position
checks.append(("always_has_winning_position", all(len(d.get("winning_position", "")) > 10 for d in results) if results else False))

# Every review has a non-empty quick summary
checks.append(("always_has_quick_summary", all(len(d.get("quick_summary", "")) > 5 for d in results) if results else False))

# Agent journey count matches participant count
checks.append(("journey_count_matches_participants", all(len(d.get("agent_journeys", [])) == d.get("participant_count", 0) for d in results) if results else False))

# Different content produces different verdicts
if len(results) >= 2:
    pos1 = results[0].get("winning_position", "")
    pos2 = results[1].get("winning_position", "")
    checks.append(("different_content_different_verdicts", pos1 != pos2))
else:
    checks.append(("different_content_different_verdicts", False))

# Rounds taken <= max rounds configured
checks.append(("rounds_taken_within_max", all(d.get("rounds_taken", 99) <= 3 for d in results) if results else False))

for name, ok in checks:
    print(f"{name}:{'true' if ok else 'false'}")
PYEOF2
) 2>/dev/null | while IFS=: read name result; do
  check "$name" "$result"
done

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[2] Agent Diversity Properties${N}"
# ═══════════════════════════════════════════════════════════════════════

echo -e "${D}  Checking agent diversity in completed reviews...${N}"

python3 << 'PYEOF3'
import json, glob, os

# Find completed reviews
reviews = []
for f in glob.glob(f"/tmp/atherum-props-*/prop_*.json"):
    try:
        data = json.load(open(f))["data"]
        if data.get("status") == "completed":
            reviews.append(data)
    except:
        pass

if not reviews:
    print("agents_have_different_names:false")
    print("agents_have_different_styles:false")
    print("agents_not_all_same_confidence:false")
    exit(0)

for review in reviews:
    agents = review.get("agents", [])
    if not agents:
        continue

    # Property: all agents have different names
    names = [a.get("name") for a in agents]
    unique_names = len(set(names)) == len(names)

    # Property: agents have at least 2 different reasoning styles
    styles = set(a.get("reasoning_style") for a in agents)
    diverse_styles = len(styles) >= min(2, len(agents))

    # Property: not all agents have identical confidence
    confidences = [a.get("confidence", 0) for a in agents]
    not_uniform = len(set(confidences)) > 1 if len(confidences) > 1 else True

    print(f"agents_have_different_names:{'true' if unique_names else 'false'}")
    print(f"agents_have_different_styles:{'true' if diverse_styles else 'false'}")
    print(f"agents_not_all_same_confidence:{'true' if not_uniform else 'false'}")
    break  # just check first review
PYEOF3
) 2>/dev/null | while IFS=: read name result; do
  check "$name" "$result"
done

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[3] /ask Consistency Properties${N}"
# ═══════════════════════════════════════════════════════════════════════

if [ -f "$TMP/$ID1.json" ]; then
  STATUS=$(python3 -c "import json; print(json.load(open('$TMP/$ID1.json'))['data']['status'])" 2>/dev/null)
  if [ "$STATUS" = "completed" ]; then
    echo -e "${D}  Testing /ask properties...${N}"

    # Property: /ask returns non-empty answer
    ANS1=$(curl -s -X POST "$API/api/review/$ID1/ask" -H "Content-Type: application/json" -d '{"question":"What was the main strength?"}')
    check "/ask_returns_nonempty_answer" "$(echo "$ANS1" | python3 -c 'import sys,json; d=json.load(sys.stdin); a=d.get("data",{}).get("answer",d.get("answer","")); print("true" if len(str(a))>10 else "false")' 2>/dev/null)"

    # Property: /ask with different questions returns different answers
    ANS2=$(curl -s -X POST "$API/api/review/$ID1/ask" -H "Content-Type: application/json" -d '{"question":"What was the main weakness?"}')
    python3 -c "
import json
a1 = json.loads('$(echo "$ANS1" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)))")').get('data',{}).get('answer','')
a2 = json.loads('$(echo "$ANS2" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)))")').get('data',{}).get('answer','')
print('true' if a1 != a2 else 'false')
" 2>/dev/null | read diff_ans
    check "/ask_different_questions_different_answers" "$diff_ans"
  fi
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[4] Error Resilience Properties${N}"
# ═══════════════════════════════════════════════════════════════════════

# Property: API always returns valid JSON, even on errors
GARBAGE=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d 'not json at all')
check "invalid_body_returns_json" "$(echo "$GARBAGE" | python3 -c 'import sys,json; json.load(sys.stdin); print("true")' 2>/dev/null || echo false)"

# Property: review with 1 agent still works
echo -e "${D}  Testing single-agent review...${N}"
SINGLE_ID=$(submit_and_wait "Simple product photo" 1 1)
SINGLE_STATUS=$(python3 -c "import json; print(json.load(open('$TMP/$SINGLE_ID.json'))['data']['status'])" 2>/dev/null)
check "single_agent_review_completes" "$([ "$SINGLE_STATUS" = "completed" ] && echo true || echo false)"

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}RESULTS${N}"
echo -e "${B}═══════${N}"
echo -e "  Total: $TOTAL"
echo -e "  ${G}Passed: $PASS${N}"
[ $FAIL -gt 0 ] && echo -e "  ${R}Failed: $FAIL${N}" || echo -e "  Failed: 0"
echo ""
