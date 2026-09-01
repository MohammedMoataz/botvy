#!/usr/bin/env bash
# Feature 001-foundation, T004/T005/T006 verification.
# Run from the repo root (or anywhere with curl + docker on PATH).
set -euo pipefail

MODEL="${1:-qwen2.5:3b-instruct}"
HOST_URL="http://localhost:11434"

echo "== T006: container -> host.docker.internal reachability =="
docker run --rm curlimages/curl -s -o /dev/null -w "status: %{http_code}\n" \
  http://host.docker.internal:11434/api/tags

echo
echo "== T005: json_schema structured output =="
curl -s "$HOST_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [{\"role\":\"user\",\"content\":\"Extract: I need to buy milk tomorrow at 5pm\"}],
    \"response_format\": {
      \"type\": \"json_schema\",
      \"json_schema\": {
        \"name\": \"task\",
        \"strict\": true,
        \"schema\": {
          \"type\": \"object\",
          \"properties\": {
            \"title\": {\"type\": \"string\"},
            \"time\": {\"type\": \"string\"}
          },
          \"required\": [\"title\", \"time\"],
          \"additionalProperties\": false
        }
      }
    }
  }" | tee /tmp/botvy-json-schema-response.json
echo
python3 -c "import json,sys; json.load(open('/tmp/botvy-json-schema-response.json'))" \
  && echo "valid JSON response" || echo "FAILED: response is not valid JSON"

echo
echo "== T004: streamed throughput benchmark =="
OUT=/tmp/botvy-stream-benchmark.txt
START=$(date +%s.%N)
curl -s -N "$HOST_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Write a 200 word story about a robot learning to cook.\"}],\"stream\":true}" \
  > "$OUT"
END=$(date +%s.%N)
CHUNKS=$(grep -c '^data: ' "$OUT" || true)
ELAPSED=$(echo "$END - $START" | bc)
TOKPS=$(echo "scale=1; $CHUNKS / $ELAPSED" | bc)
echo "chunks: $CHUNKS, elapsed: ${ELAPSED}s, approx tok/s: $TOKPS  (gate: >= 12)"
