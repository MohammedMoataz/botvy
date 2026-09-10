#!/usr/bin/env bash
# Set up task generation for a feature, the POSIX half of
# .specify/scripts/powershell/setup-tasks.ps1.
#
# Usage: ./setup-tasks.sh [--json] [--help]
#
# /speckit-tasks parses the --json output for FEATURE_DIR, AVAILABLE_DOCS and
# TASKS_TEMPLATE, and expects the two paths absolute. They are: every path here
# is built from the repo root, which get_repo_root resolves with `pwd -P`.

set -euo pipefail

JSON=false

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=true ;;
    --help | -h)
      printf 'Usage: setup-tasks.sh [--json] [--help]\n'
      exit 0
      ;;
    *)
      printf 'ERROR: Unknown option: %s\n' "$1" >&2
      printf 'Usage: setup-tasks.sh [--json] [--help]\n' >&2
      exit 1
      ;;
  esac
  shift
done

# shellcheck source=./common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

get_feature_paths

# Same reasoning as setup-plan.sh: a pinned feature directory is the feature's
# identity, so the branch naming rule does not apply to it.
if ! feature_json_matches_feature_dir "$REPO_ROOT" "$FEATURE_DIR"; then
  if ! check_feature_branch "$CURRENT_BRANCH" "$HAS_GIT"; then
    exit 1
  fi
fi

if [ ! -f "$IMPL_PLAN" ]; then
  printf 'ERROR: plan.md not found in %s\n' "$FEATURE_DIR" >&2
  printf 'Run /speckit-plan first to create the implementation plan.\n' >&2
  exit 1
fi

if [ ! -f "$FEATURE_SPEC" ]; then
  printf 'ERROR: spec.md not found in %s\n' "$FEATURE_DIR" >&2
  printf 'Run /speckit-specify first to create the feature structure.\n' >&2
  exit 1
fi

docs=()
[ -e "$RESEARCH" ] && docs+=('research.md')
[ -e "$DATA_MODEL" ] && docs+=('data-model.md')
# Any child counts, directories included, matching Get-ChildItem over there.
if [ -d "$CONTRACTS_DIR" ] && [ -n "$(ls -A "$CONTRACTS_DIR" 2>/dev/null)" ]; then
  docs+=('contracts/')
fi
[ -e "$QUICKSTART" ] && docs+=('quickstart.md')

# A missing tasks template is fatal, and the message says where the resolver
# looked. "Template not found" on its own sends people hunting through the
# override stack by hand.
if ! tasks_template="$(resolve_template 'tasks-template' "$REPO_ROOT")" || [ ! -f "$tasks_template" ]; then
  expected_core="$REPO_ROOT/.specify/templates/tasks-template.md"
  printf 'ERROR: Tasks template not found for repository root: %s\nTemplate resolution order: overrides -> presets -> extensions -> core.\nExpected shared/core template location: %s\nTo continue, verify whether '\''tasks-template.md'\'' is available in '\''.specify/templates/overrides/'\'', preset templates, extension templates, or restore the shared/core templates (for example by re-running '\''specify init'\'') so that '\''.specify/templates/tasks-template.md'\'' exists.\n' \
    "$REPO_ROOT" "$expected_core" >&2
  exit 1
fi

if [ "$JSON" = true ]; then
  list=''
  for doc in ${docs[@]+"${docs[@]}"}; do
    list="${list:+$list,}\"$(json_escape "$doc")\""
  done
  printf '{"FEATURE_DIR":"%s","AVAILABLE_DOCS":[%s],"TASKS_TEMPLATE":"%s"}\n' \
    "$(json_escape "$FEATURE_DIR")" "$list" "$(json_escape "$tasks_template")"
else
  printf 'FEATURE_DIR: %s\n' "$FEATURE_DIR"
  printf 'TASKS_TEMPLATE: %s\n' "$tasks_template"
  printf 'AVAILABLE_DOCS:\n'
  check_file "$RESEARCH" 'research.md' || true
  check_file "$DATA_MODEL" 'data-model.md' || true
  check_dir_has_files "$CONTRACTS_DIR" 'contracts/' || true
  check_file "$QUICKSTART" 'quickstart.md' || true
fi
