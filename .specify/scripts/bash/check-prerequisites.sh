#!/usr/bin/env bash
# Consolidated prerequisite checking, the POSIX half of
# .specify/scripts/powershell/check-prerequisites.ps1.
#
# Usage: ./check-prerequisites.sh [OPTIONS]
#
# OPTIONS:
#   --json              Output in JSON format
#   --require-tasks     Require tasks.md to exist (for implementation phase)
#   --include-tasks     Include tasks.md in AVAILABLE_DOCS list
#   --paths-only        Only output path variables (no validation)
#   --help, -h          Show help message
#
# The --json shape is what /speckit-analyze, /speckit-clarify,
# /speckit-implement, /speckit-checklist and /speckit-taskstoissues parse, so
# the keys, their order and AVAILABLE_DOCS being an array are all contract.

set -euo pipefail

JSON=false
REQUIRE_TASKS=false
INCLUDE_TASKS=false
PATHS_ONLY=false

show_help() {
  cat <<'EOF'
Usage: check-prerequisites.sh [OPTIONS]

Consolidated prerequisite checking for Spec-Driven Development workflow.

OPTIONS:
  --json              Output in JSON format
  --require-tasks     Require tasks.md to exist (for implementation phase)
  --include-tasks     Include tasks.md in AVAILABLE_DOCS list
  --paths-only        Only output path variables (no prerequisite validation)
  --help, -h          Show this help message

EXAMPLES:
  # Check task prerequisites (plan.md required)
  ./check-prerequisites.sh --json

  # Check implementation prerequisites (plan.md + tasks.md required)
  ./check-prerequisites.sh --json --require-tasks --include-tasks

  # Get feature paths only (no validation)
  ./check-prerequisites.sh --paths-only
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=true ;;
    --require-tasks) REQUIRE_TASKS=true ;;
    --include-tasks) INCLUDE_TASKS=true ;;
    --paths-only) PATHS_ONLY=true ;;
    --help | -h)
      show_help
      exit 0
      ;;
    *)
      # An unrecognised flag is a caller bug, and silently ignoring it would
      # mean silently skipping the check it asked for.
      printf 'ERROR: Unknown option: %s\n' "$1" >&2
      show_help >&2
      exit 1
      ;;
  esac
  shift
done

# shellcheck source=./common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

get_feature_paths

if [ "$PATHS_ONLY" = true ]; then
  if [ "$JSON" = true ]; then
    printf '{"REPO_ROOT":"%s","BRANCH":"%s","FEATURE_DIR":"%s","FEATURE_SPEC":"%s","IMPL_PLAN":"%s","TASKS":"%s"}\n' \
      "$(json_escape "$REPO_ROOT")" \
      "$(json_escape "$CURRENT_BRANCH")" \
      "$(json_escape "$FEATURE_DIR")" \
      "$(json_escape "$FEATURE_SPEC")" \
      "$(json_escape "$IMPL_PLAN")" \
      "$(json_escape "$TASKS")"
  else
    printf 'REPO_ROOT: %s\n' "$REPO_ROOT"
    printf 'BRANCH: %s\n' "$CURRENT_BRANCH"
    printf 'FEATURE_DIR: %s\n' "$FEATURE_DIR"
    printf 'FEATURE_SPEC: %s\n' "$FEATURE_SPEC"
    printf 'IMPL_PLAN: %s\n' "$IMPL_PLAN"
    printf 'TASKS: %s\n' "$TASKS"
  fi
  exit 0
fi

if ! check_feature_branch "$CURRENT_BRANCH" "$HAS_GIT"; then
  exit 1
fi

# These three refusals print on stdout rather than stderr. That looks wrong and
# is deliberate: the PowerShell script uses Write-Output for them, and a skill
# that only reads stdout has to be able to see why the run stopped.
if [ ! -d "$FEATURE_DIR" ]; then
  printf 'ERROR: Feature directory not found: %s\n' "$FEATURE_DIR"
  printf 'Run /speckit-specify first to create the feature structure.\n'
  exit 1
fi

if [ ! -f "$IMPL_PLAN" ]; then
  printf 'ERROR: plan.md not found in %s\n' "$FEATURE_DIR"
  printf 'Run /speckit-plan first to create the implementation plan.\n'
  exit 1
fi

if [ "$REQUIRE_TASKS" = true ] && [ ! -f "$TASKS" ]; then
  printf 'ERROR: tasks.md not found in %s\n' "$FEATURE_DIR"
  printf 'Run /speckit-tasks first to create the task list.\n'
  exit 1
fi

# Build the available-docs list. Order is contract: the skills present it to
# the model as-is, and contracts/ counts only when it actually holds a file --
# an empty directory advertised as a document sends the model looking for one.
docs=()
[ -e "$RESEARCH" ] && docs+=('research.md')
[ -e "$DATA_MODEL" ] && docs+=('data-model.md')
# `ls -A` rather than `find`: this test counts any child, directory included,
# which is what the PowerShell Get-ChildItem does. The [OK]/[FAIL] line printed
# in text mode is the stricter files-only test, exactly as over there.
if [ -d "$CONTRACTS_DIR" ] && [ -n "$(ls -A "$CONTRACTS_DIR" 2>/dev/null)" ]; then
  docs+=('contracts/')
fi
[ -e "$QUICKSTART" ] && docs+=('quickstart.md')
if [ "$INCLUDE_TASKS" = true ] && [ -e "$TASKS" ]; then
  docs+=('tasks.md')
fi

if [ "$JSON" = true ]; then
  list=''
  for doc in ${docs[@]+"${docs[@]}"}; do
    list="${list:+$list,}\"$(json_escape "$doc")\""
  done
  printf '{"FEATURE_DIR":"%s","AVAILABLE_DOCS":[%s]}\n' "$(json_escape "$FEATURE_DIR")" "$list"
else
  printf 'FEATURE_DIR:%s\n' "$FEATURE_DIR"
  printf 'AVAILABLE_DOCS:\n'

  # `|| true` on each: these report by exit status as well as by line, and a
  # missing optional document must not take the whole script down under -e.
  check_file "$RESEARCH" 'research.md' || true
  check_file "$DATA_MODEL" 'data-model.md' || true
  check_dir_has_files "$CONTRACTS_DIR" 'contracts/' || true
  check_file "$QUICKSTART" 'quickstart.md' || true

  if [ "$INCLUDE_TASKS" = true ]; then
    check_file "$TASKS" 'tasks.md' || true
  fi
fi
