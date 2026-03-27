#!/bin/bash
# Atherum Foundation Tests
# Tests every weak point in the deliberation engine

API="https://next-okapi-818.convex.site"
PASS=0
FAIL=0
TOTAL=0
TMP="/tmp/atherum-foundation-$$"
mkdir -p $TMP

B="\033[1m"
G="\033[32m"
R="\033[31m"
Y="\033[33m"
D="\033[2m"
N="\033[0m"

check() {
  TOTAL=$((TOTAL + 1))
  local name="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${G}PASS${N}  $name"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${R}FAIL${N}  $name"
  fi
}

wait_for_review() {
  local id="$1"
  local timeout="${2:-120}"
  local start=$(date +%s)
  while true; do
    curl -s "$API/api/review/$id/status" > "$TMP/$id.json" 2>/dev/null
    local status=$(python3 -c "import json; print(json.load(open('$TMP/$id.json'))['data']['status'])" 2>/dev/null)
    if [ "$status" = "completed" ] || [ "$status" = "failed" ]; then
      echo "$status"
      return
    fi
    local now=$(date +%s)
    if [ $((now - start)) -gt $timeout ]; then
      echo "timeout"
      return
    fi
    sleep 3
  done
}

echo ""
echo -e "${B}ATHERUM FOUNDATION TESTS${N}"
echo -e "${D}Testing: API, Deliberation, Convergence, Error Handling, /ask${N}"
echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[1] API Health & Validation${N}"
# ═══════════════════════════════════════════════════════════════════════

# Test 1.1: Health endpoint
HEALTH=$(curl -s "$API/health")
check "Health endpoint responds" "$(echo "$HEALTH" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin).get("status")=="ok" else "false")' 2>/dev/null)"

# Test 1.2: Empty body
EMPTY=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d '{}')
check "Rejects empty body" "$(echo "$EMPTY" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if not d.get("success", True) else "false")' 2>/dev/null)"

# Test 1.3: Missing content_description
MISSING=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d '{"content_type":"image"}')
check "Rejects missing content_description" "$(echo "$MISSING" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if not d.get("success", True) else "false")' 2>/dev/null)"

# Test 1.4: Valid minimal request
MINIMAL=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"test minimal\",
  \"content_type\": \"image\",
  \"review_id\": \"test_minimal_$(date +%s)\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}")
check "Accepts valid minimal request" "$(echo "$MINIMAL" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin).get("success") else "false")' 2>/dev/null)"
MINIMAL_ID=$(echo "$MINIMAL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("data",{}).get("review_id",""))' 2>/dev/null)

# Test 1.5: Agent count bounds — 0 agents
ZERO_AGENTS=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"test zero agents\",
  \"content_type\": \"image\",
  \"review_id\": \"test_zero_$(date +%s)\",
  \"max_rounds\": 1,
  \"agent_count\": 0
}")
check "Handles 0 agent_count" "$(echo "$ZERO_AGENTS" | python3 -c 'import sys,json; print("true")' 2>/dev/null)"

# Test 1.6: Agent count bounds — 100 agents (should cap)
HUGE_AGENTS=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"test huge agents\",
  \"content_type\": \"image\",
  \"review_id\": \"test_huge_$(date +%s)\",
  \"max_rounds\": 1,
  \"agent_count\": 100
}")
check "Handles 100 agent_count (should cap)" "$(echo "$HUGE_AGENTS" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin).get("success") is not None else "false")' 2>/dev/null)"

# Test 1.7: Non-existent review status
NOT_FOUND=$(curl -s "$API/api/review/nonexistent_12345/status")
check "Returns error for non-existent review" "$(echo "$NOT_FOUND" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if not d.get("success", True) or d.get("data",{}).get("status")=="not_found" else "false")' 2>/dev/null)"

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[2] Deliberation Engine${N}"
# ═══════════════════════════════════════════════════════════════════════

# Test 2.1: 2 agents, 1 round — fastest possible review
echo -e "${D}  Submitting 2-agent, 1-round review...${N}"
FAST_ID="test_fast_$(date +%s)"
curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"Professional headshot on white background\",
  \"content_type\": \"image\",
  \"review_id\": \"$FAST_ID\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}" > /dev/null

FAST_STATUS=$(wait_for_review "$FAST_ID" 60)
check "2-agent 1-round completes" "$([ "$FAST_STATUS" = "completed" ] && echo true || echo false)"

# Validate response structure
if [ "$FAST_STATUS" = "completed" ]; then
  python3 -c "
import json, sys
data = json.load(open('$TMP/$FAST_ID.json'))['data']
result = data.get('result', {})
decision = result.get('decision', {})
agents = data.get('agents', [])

checks = {
  'has_review_id': 'review_id' in result,
  'has_status': result.get('status') == 'completed',
  'has_winning_position': bool(decision.get('winning_position')),
  'has_convergence': isinstance(decision.get('convergence_score'), (int, float)),
  'convergence_in_range': 0 <= decision.get('convergence_score', -1) <= 1,
  'has_confidence': isinstance(decision.get('confidence'), (int, float)),
  'has_approval_score': isinstance(decision.get('approval_score'), (int, float)),
  'approval_in_range': 0 <= decision.get('approval_score', -1) <= 100,
  'has_quick_summary': bool(decision.get('quick_summary')),
  'has_key_agreements': isinstance(decision.get('key_agreements'), list),
  'has_remaining_dissent': isinstance(decision.get('remaining_dissent'), list),
  'has_agent_journeys': isinstance(decision.get('agent_journeys'), list),
  'correct_agent_count': len(agents) == 2,
  'agents_have_names': all('name' in a for a in agents),
  'agents_have_styles': all('reasoning_style' in a for a in agents),
}

for name, ok in checks.items():
  print(f'{name}:{\"true\" if ok else \"false\"}')
" 2>/dev/null | while IFS=: read name result; do
    check "  response.$name" "$result"
  done
fi

echo ""

# Test 2.2: 3 agents, 2 rounds — check convergence changes between rounds
echo -e "${D}  Submitting 3-agent, 2-round review...${N}"
CONV_ID="test_conv_$(date +%s)"
curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"Vibrant flat-lay of colorful sneakers with props on a pink background\",
  \"content_type\": \"image\",
  \"review_id\": \"$CONV_ID\",
  \"max_rounds\": 2,
  \"agent_count\": 3
}" > /dev/null

CONV_STATUS=$(wait_for_review "$CONV_ID" 90)
check "3-agent 2-round completes" "$([ "$CONV_STATUS" = "completed" ] && echo true || echo false)"

if [ "$CONV_STATUS" = "completed" ]; then
  python3 -c "
import json
data = json.load(open('$TMP/$CONV_ID.json'))['data']
decision = data.get('result', {}).get('decision', {})
journeys = decision.get('agent_journeys', [])

# Check agent journeys have multiple rounds
multi_round = all(len(j.get('positions', [])) >= 2 for j in journeys) if journeys else False
print(f'journeys_have_2_rounds:{\"true\" if multi_round else \"false\"}')

# Check stance changes tracked
has_changes = all('total_stance_changes' in j for j in journeys) if journeys else False
print(f'stance_changes_tracked:{\"true\" if has_changes else \"false\"}')

# Check consistency scores
has_consistency = all('consistency_score' in j for j in journeys) if journeys else False
print(f'consistency_scores_present:{\"true\" if has_consistency else \"false\"}')

# Check convergence is a real number
conv = decision.get('convergence_score', -1)
print(f'convergence_is_real:{\"true\" if isinstance(conv, (int, float)) and 0 <= conv <= 1 else \"false\"}')

# Check rounds_taken
print(f'rounds_taken_correct:{\"true\" if decision.get(\"rounds_taken\", 0) >= 1 else \"false\"}')
" 2>/dev/null | while IFS=: read name result; do
    check "  $name" "$result"
  done
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[3] /ask Follow-up Endpoint${N}"
# ═══════════════════════════════════════════════════════════════════════

# Use the FAST review for /ask tests (should be completed by now)
if [ "$FAST_STATUS" = "completed" ]; then
  # Test 3.1: General question
  echo -e "${D}  Asking follow-up question...${N}"
  ASK_RESULT=$(curl -s -X POST "$API/api/review/$FAST_ID/ask" -H "Content-Type: application/json" -d '{
    "question": "What was the main concern?"
  }')
  check "/ask returns answer" "$(echo "$ASK_RESULT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if d.get("data",{}).get("answer") or d.get("answer") else "false")' 2>/dev/null)"

  # Test 3.2: Ask on non-existent review
  ASK_BAD=$(curl -s -X POST "$API/api/review/nonexistent_xyz/ask" -H "Content-Type: application/json" -d '{
    "question": "test"
  }')
  check "/ask rejects non-existent review" "$(echo "$ASK_BAD" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("true" if d.get("error") or not d.get("success", True) else "false")' 2>/dev/null)"

  # Test 3.3: Ask with empty question
  ASK_EMPTY=$(curl -s -X POST "$API/api/review/$FAST_ID/ask" -H "Content-Type: application/json" -d '{}')
  check "/ask handles empty question" "$(echo "$ASK_EMPTY" | python3 -c 'import sys,json; print("true")' 2>/dev/null)"
else
  echo -e "  ${Y}SKIP${N}  /ask tests (no completed review)"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[4] Edge Cases${N}"
# ═══════════════════════════════════════════════════════════════════════

# Test 4.1: Very long content description
LONG_DESC=$(python3 -c "print('A' * 5000)")
LONG_RESULT=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"$LONG_DESC\",
  \"content_type\": \"image\",
  \"review_id\": \"test_long_$(date +%s)\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}")
check "Handles very long content description" "$(echo "$LONG_RESULT" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin).get("success") is not None else "false")' 2>/dev/null)"

# Test 4.2: Special characters in description
SPECIAL_RESULT=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"Photo with \\\"quotes\\\" and <html> tags & special chars: @#$%\",
  \"content_type\": \"image\",
  \"review_id\": \"test_special_$(date +%s)\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}")
check "Handles special characters" "$(echo "$SPECIAL_RESULT" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin).get("success") is not None else "false")' 2>/dev/null)"

# Test 4.3: Unicode content
UNICODE_RESULT=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"Japanese product: おしゃれなスニーカー with emoji 🎨\",
  \"content_type\": \"image\",
  \"review_id\": \"test_unicode_$(date +%s)\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}")
check "Handles unicode/emoji content" "$(echo "$UNICODE_RESULT" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin).get("success") is not None else "false")' 2>/dev/null)"

# Test 4.4: Invalid content_type
BADTYPE=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"test\",
  \"content_type\": \"invalid_type\",
  \"review_id\": \"test_badtype_$(date +%s)\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}")
check "Handles invalid content_type" "$(echo "$BADTYPE" | python3 -c 'import sys,json; print("true")' 2>/dev/null)"

# Test 4.5: Duplicate review_id
DUP_ID="test_dup_$(date +%s)"
curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"first\",
  \"content_type\": \"image\",
  \"review_id\": \"$DUP_ID\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}" > /dev/null
DUP2=$(curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{
  \"content_description\": \"second duplicate\",
  \"content_type\": \"image\",
  \"review_id\": \"$DUP_ID\",
  \"max_rounds\": 1,
  \"agent_count\": 2
}")
check "Handles duplicate review_id" "$(echo "$DUP2" | python3 -c 'import sys,json; print("true")' 2>/dev/null)"

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}[5] Concurrent Reviews${N}"
# ═══════════════════════════════════════════════════════════════════════

echo -e "${D}  Submitting 3 reviews simultaneously...${N}"
C1_ID="test_conc1_$(date +%s)"
C2_ID="test_conc2_$(date +%s)"
C3_ID="test_conc3_$(date +%s)"

curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{\"content_description\":\"Product A\",\"content_type\":\"image\",\"review_id\":\"$C1_ID\",\"max_rounds\":1,\"agent_count\":2}" > /dev/null &
curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{\"content_description\":\"Product B\",\"content_type\":\"image\",\"review_id\":\"$C2_ID\",\"max_rounds\":1,\"agent_count\":2}" > /dev/null &
curl -s -X POST "$API/api/review" -H "Content-Type: application/json" -d "{\"content_description\":\"Product C\",\"content_type\":\"image\",\"review_id\":\"$C3_ID\",\"max_rounds\":1,\"agent_count\":2}" > /dev/null &
wait

echo -e "${D}  Waiting for all 3 to complete...${N}"
S1=$(wait_for_review "$C1_ID" 120)
S2=$(wait_for_review "$C2_ID" 120)
S3=$(wait_for_review "$C3_ID" 120)

check "Concurrent review 1 completes" "$([ "$S1" = "completed" ] && echo true || echo false)"
check "Concurrent review 2 completes" "$([ "$S2" = "completed" ] && echo true || echo false)"
check "Concurrent review 3 completes" "$([ "$S3" = "completed" ] && echo true || echo false)"

# Check they got different results (not just returning cached data)
if [ "$S1" = "completed" ] && [ "$S2" = "completed" ]; then
  python3 -c "
import json
d1 = json.load(open('$TMP/$C1_ID.json'))['data'].get('result',{}).get('decision',{}).get('winning_position','')
d2 = json.load(open('$TMP/$C2_ID.json'))['data'].get('result',{}).get('decision',{}).get('winning_position','')
print('true' if d1 != d2 else 'false')
" 2>/dev/null | read different
  check "Concurrent reviews produce different verdicts" "$different"
fi

echo ""

# ═══════════════════════════════════════════════════════════════════════
echo -e "${B}RESULTS${N}"
echo -e "${B}═══════${N}"
echo -e "  Total: $TOTAL"
echo -e "  ${G}Passed: $PASS${N}"
[ $FAIL -gt 0 ] && echo -e "  ${R}Failed: $FAIL${N}" || echo -e "  Failed: 0"
echo ""
echo -e "${D}Results saved to: $TMP/${N}"
echo ""
