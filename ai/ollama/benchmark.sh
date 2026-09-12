#!/usr/bin/env bash
# Is the model server usable by Botvy? Four questions, in the order they fail.
#
#   ./ai/ollama/benchmark.sh [model]     # default: qwen2.5:3b-instruct
#
# Run it after installing Ollama (see SETUP.md) and after changing any of the
# `llm.*` registry keys to a model this host has not served before.
set -euo pipefail

MODEL="${1:-qwen2.5:3b-instruct}"
HOST_URL="${OLLAMA_HOST_URL:-http://localhost:11434}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== 1. a container can reach the host =="
# The check that matters: the backend runs in a container, and a server bound to
# loopback answers the host and nothing else. This is the most common failure.
docker run --rm curlimages/curl -s -o /dev/null -w "status: %{http_code}\n" \
  http://host.docker.internal:11434/api/tags

echo
echo "== 2. the model is present =="
if curl -s "$HOST_URL/api/tags" | grep -q "\"$MODEL\""; then
  echo "$MODEL: pulled"
else
  echo "FAILED: $MODEL is not on this host. Botvy never pulls — run: ollama pull $MODEL"
  exit 1
fi

echo
echo "== 3. schema-constrained output =="
# Extraction depends on this entirely: the grammar is enforced, the prompt is
# only advice. A model that ignores the schema cannot do the job whatever it
# scores on chat.
curl -s "$HOST_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
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
  }" | tee "$TMP/schema.json"
echo
# node rather than python3: this repository already requires Node 24 and may not
# have a Python at all.
node -e "JSON.parse(require('fs').readFileSync('$TMP/schema.json','utf8'))" \
  && echo "valid JSON response" || { echo "FAILED: response is not valid JSON"; exit 1; }

echo
echo "== 4. streamed throughput =="
OUT="$TMP/stream.txt"
START=$(date +%s.%N)
curl -s -N "$HOST_URL/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Write a 200 word story about a robot learning to cook.\"}],\"stream\":true}" \
  > "$OUT"
END=$(date +%s.%N)
CHUNKS=$(grep -c '^data: ' "$OUT" || true)
ELAPSED=$(echo "$END - $START" | bc)
TOKPS=$(echo "scale=1; $CHUNKS / $ELAPSED" | bc)
echo "chunks: $CHUNKS, elapsed: ${ELAPSED}s, approx tok/s: $TOKPS  (want >= 12)"

echo
echo "== residency =="
# The number that explains a bad throughput result. size_vram below size means
# the model spilled to system memory, which costs an order of magnitude.
curl -s "$HOST_URL/api/ps"
echo
