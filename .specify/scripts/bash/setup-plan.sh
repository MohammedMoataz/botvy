#!/usr/bin/env bash
# Set up the implementation plan for a feature, the POSIX half of
# .specify/scripts/powershell/setup-plan.ps1.
#
# Usage: ./setup-plan.sh [--json] [--help]
#
# /speckit-plan parses the --json output for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR
# and BRANCH, so those keys and their order are contract. HAS_GIT is a JSON
# boolean, not the string "true" -- ConvertTo-Json emits a real boolean for the
# PowerShell [bool], and a client that checks `=== true` would be wrong-footed
# by a quoted one.

set -euo pipefail

JSON=false

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=true ;;
    --help | -h)
      printf 'Usage: ./setup-plan.sh [--json] [--help]\n'
      printf '  --json     Output results in JSON format\n'
      printf '  --help     Show this help message\n'
      exit 0
      ;;
    *)
      printf 'ERROR: Unknown option: %s\n' "$1" >&2
      printf 'Usage: ./setup-plan.sh [--json] [--help]\n' >&2
      exit 1
      ;;
  esac
  shift
done

# shellcheck source=./common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

get_feature_paths

# When feature.json pins the feature directory, that pin is the identity of the
# feature and the branch name is beside the point -- so the naming check is
# skipped rather than failed. It still runs for an unpinned feature, where the
# branch prefix is the only thing that says which feature this is.
if ! feature_json_matches_feature_dir "$REPO_ROOT" "$FEATURE_DIR"; then
  if ! check_feature_branch "$CURRENT_BRANCH" "$HAS_GIT"; then
    exit 1
  fi
fi

mkdir -p "$FEATURE_DIR"

if [ -f "$IMPL_PLAN" ]; then
  # In --json mode this goes to stderr: anything on stdout there has to be the
  # JSON document, or the skill's parse fails on a line of prose.
  if [ "$JSON" = true ]; then
    printf 'Plan already exists at %s, skipping template copy\n' "$IMPL_PLAN" >&2
  else
    printf 'Plan already exists at %s, skipping template copy\n' "$IMPL_PLAN"
  fi
else
  if template="$(resolve_template 'plan-template' "$REPO_ROOT")" && [ -f "$template" ]; then
    # A plain byte copy. The PowerShell side goes out of its way to write UTF-8
    # without a BOM; cp cannot introduce one, so there is nothing to guard here.
    cp "$template" "$IMPL_PLAN"
  else
    printf 'WARNING: Plan template not found\n' >&2
    # An empty plan.md still lets /speckit-plan write into a known path, which
    # is a better failure than stopping with nothing on disk.
    : >"$IMPL_PLAN"
  fi
fi

if [ "$JSON" = true ]; then
  printf '{"FEATURE_SPEC":"%s","IMPL_PLAN":"%s","SPECS_DIR":"%s","BRANCH":"%s","HAS_GIT":%s}\n' \
    "$(json_escape "$FEATURE_SPEC")" \
    "$(json_escape "$IMPL_PLAN")" \
    "$(json_escape "$FEATURE_DIR")" \
    "$(json_escape "$CURRENT_BRANCH")" \
    "$HAS_GIT"
else
  printf 'FEATURE_SPEC: %s\n' "$FEATURE_SPEC"
  printf 'IMPL_PLAN: %s\n' "$IMPL_PLAN"
  printf 'SPECS_DIR: %s\n' "$FEATURE_DIR"
  printf 'BRANCH: %s\n' "$CURRENT_BRANCH"
  # PowerShell stringifies $true as "True"; matched so a human diffing the two
  # transcripts sees no difference worth chasing.
  if [ "$HAS_GIT" = true ]; then printf 'HAS_GIT: True\n'; else printf 'HAS_GIT: False\n'; fi
fi
