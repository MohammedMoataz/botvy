#!/usr/bin/env bash
# Common shell functions, the POSIX half of .specify/scripts/powershell/common.ps1.
#
# Why this file exists at all: the repo was initialised with `specify init
# --script ps`, so spec-kit only laid down the PowerShell half. The deployment
# target is a Linux docker host and CI runs on ubuntu-latest, which means every
# developer on a machine without PowerShell had no way to run /speckit-plan,
# /speckit-tasks or the prerequisite check. These are ports, not rewrites: the
# `--json` output of each script is parsed by the speckit skills, so the keys,
# their order and their types have to mean exactly what the PowerShell ones mean.
#
# One deliberate structural difference from upstream spec-kit's common.sh:
# upstream's `get_feature_paths` prints `KEY='value'` lines that the caller
# `eval`s. That pattern cannot fail properly -- a resolution error inside
# `$(...)` only kills the subshell, so the caller sails on with empty paths.
# Ours assigns globals in the caller's own shell instead, which lets a failed
# resolution `exit 1` for real, the way Get-FeaturePathsEnv does.
#
# Not ported: Resolve-TemplateContent and Get-Python3Command. Nothing in this
# repo calls them (the three scripts all use Resolve-Template), and they are
# ~200 lines of preset composition driven by a Python YAML parse. Porting dead
# code just gives us two copies to keep in step. If preset composition ever
# lands here, port them then.

set -euo pipefail

# --- repo root -------------------------------------------------------------

# Walk upward looking for a .specify directory. That, not .git, is the primary
# marker for a spec-kit project: a spec-kit initialised in a subdirectory of a
# larger git repo must resolve to the subdirectory, not to the outer repo.
find_specify_root() {
  local current
  current="$(cd "${1:-$PWD}" 2>/dev/null && pwd -P)" || return 1

  while true; do
    if [ -d "$current/.specify" ]; then
      printf '%s\n' "$current"
      return 0
    fi
    local parent
    parent="$(dirname "$current")"
    if [ -z "$parent" ] || [ "$parent" = "$current" ]; then
      return 1
    fi
    current="$parent"
  done
}

get_repo_root() {
  local specify_root
  if specify_root="$(find_specify_root)"; then
    printf '%s\n' "$specify_root"
    return 0
  fi

  # Fall back to git, then to this script's own location three levels up
  # (.specify/scripts/bash/ -> repo root), which is what a non-git checkout gets.
  local git_root
  if git_root="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$git_root" ]; then
    printf '%s\n' "$git_root"
    return 0
  fi

  (cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)
}

# True only when git is installed AND the repo root is inside a work tree.
# The .git test accepts a file as well as a directory, because worktrees and
# submodules use a file.
has_git() {
  command -v git >/dev/null 2>&1 || return 1
  local repo_root
  repo_root="$(get_repo_root)"
  [ -e "$repo_root/.git" ] || return 1
  git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

# --- branch names ----------------------------------------------------------

get_current_branch() {
  # An explicit override wins over everything, including git.
  if [ -n "${SPECIFY_FEATURE:-}" ]; then
    printf '%s\n' "$SPECIFY_FEATURE"
    return 0
  fi

  local repo_root
  repo_root="$(get_repo_root)"

  if has_git; then
    local branch
    if branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null)" && [ -n "$branch" ]; then
      printf '%s\n' "$branch"
      return 0
    fi
  fi

  # Non-git checkout: guess from the newest feature directory. A timestamp
  # prefix always beats a sequential one -- the PowerShell version reaches the
  # same conclusion through an order-dependent flag, which is easy to misread;
  # tracking the two candidates separately says the same thing out loud.
  local specs_dir="$repo_root/specs"
  if [ -d "$specs_dir" ]; then
    local latest_timestamp='' latest_ts_name='' highest=0 highest_num_name='' name
    for dir in "$specs_dir"/*/; do
      [ -d "$dir" ] || continue
      name="$(basename "$dir")"
      if [[ $name =~ ^([0-9]{8}-[0-9]{6})- ]]; then
        # Timestamps are fixed-width, so a string compare is a date compare.
        if [[ "${BASH_REMATCH[1]}" > "$latest_timestamp" ]]; then
          latest_timestamp="${BASH_REMATCH[1]}"
          latest_ts_name="$name"
        fi
      elif [[ $name =~ ^([0-9]{3,})- ]]; then
        local num=$((10#${BASH_REMATCH[1]}))
        if [ "$num" -gt "$highest" ]; then
          highest="$num"
          highest_num_name="$name"
        fi
      fi
    done

    if [ -n "$latest_ts_name" ]; then
      printf '%s\n' "$latest_ts_name"
      return 0
    fi
    if [ -n "$highest_num_name" ]; then
      printf '%s\n' "$highest_num_name"
      return 0
    fi
  fi

  printf '%s\n' 'main'
}

# Strip one optional path segment, so a gitflow branch "feat/016-name" is
# treated as "016-name". Only when the whole name is exactly two slash-free
# segments; anything deeper is returned untouched rather than guessed at.
effective_branch_name() {
  local branch="$1"
  if [[ $branch =~ ^([^/]+)/([^/]+)$ ]]; then
    printf '%s\n' "${BASH_REMATCH[2]}"
  else
    printf '%s\n' "$branch"
  fi
}

# check_feature_branch <branch> <has_git: true|false>
check_feature_branch() {
  local raw="$1" has_git_repo="${2:-true}"

  # Without git there is no branch to validate, and refusing to run would make
  # every non-git checkout useless. Warn and continue, like the PowerShell side.
  if [ "$has_git_repo" != 'true' ]; then
    printf 'WARNING: [specify] Warning: Git repository not detected; skipped branch validation\n' >&2
    return 0
  fi

  local branch
  branch="$(effective_branch_name "$raw")"

  # A sequential prefix is 3+ digits. The two exclusions below are malformed
  # timestamps -- a 7-or-8 digit date plus a 6-digit time -- which would
  # otherwise sail through the "3+ digits" test and be treated as feature 2026.
  local malformed_timestamp=false
  if [[ $branch =~ ^[0-9]{7}-[0-9]{6}- ]] || [[ $branch =~ ^([0-9]{7}|[0-9]{8})-[0-9]{6}$ ]]; then
    malformed_timestamp=true
  fi

  local is_sequential=false
  if [[ $branch =~ ^[0-9]{3,}- ]] && [ "$malformed_timestamp" = false ]; then
    is_sequential=true
  fi

  if [ "$is_sequential" = false ] && [[ ! $branch =~ ^[0-9]{8}-[0-9]{6}- ]]; then
    printf 'ERROR: Not on a feature branch. Current branch: %s\n' "$raw" >&2
    printf 'Feature branches should be named like: 001-feature-name, 1234-feature-name, or 20260319-143022-feature-name\n' >&2
    return 1
  fi
  return 0
}

# --- feature directory resolution ------------------------------------------

# Pull one string value out of a small, flat JSON file without requiring jq.
# jq is not a prerequisite of this repo (SETUP.md lists node, docker and pnpm),
# and .specify/feature.json is a two-line file written by /speckit-specify, so
# grep is enough. It reads the first match only, which is what a well-formed
# object has. Anything more structured than this belongs in node, not sed.
json_string_value() {
  local file="$1" key="$2"
  grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" 2>/dev/null |
    head -n 1 |
    sed 's/.*:[[:space:]]*"//; s/"$//'
}

# True when .specify/feature.json pins a directory that is also the active
# FEATURE_DIR. /speckit-plan and /speckit-tasks use this to skip the branch
# naming check: when the feature is pinned by file, the branch name is not the
# thing that identifies it, and refusing to plan on a differently named branch
# would be refusing over an irrelevance.
feature_json_matches_feature_dir() {
  local repo_root="$1" active_feature_dir="$2"
  local feature_json="$repo_root/.specify/feature.json"

  [ -f "$feature_json" ] || return 1

  local fd
  fd="$(json_string_value "$feature_json" 'feature_directory')"
  [ -n "$fd" ] || return 1

  case "$fd" in
    /*) ;;
    *) fd="$repo_root/$fd" ;;
  esac

  [ -d "$fd" ] || return 1

  # Compare canonical forms. POSIX filesystems are case-sensitive, so unlike
  # the PowerShell version there is no case-insensitive branch to pick here.
  local norm_json norm_active
  norm_json="$(cd "$fd" && pwd -P)" || return 1
  norm_active="$(cd "$active_feature_dir" 2>/dev/null && pwd -P)" || return 1

  [ "$norm_json" = "$norm_active" ]
}

# Resolve specs/<dir> from a branch's numeric or timestamp prefix, so branch
# "016-tasks-labels-reminders" finds specs/016-tasks-labels-reminders even if
# the slug drifted. Prints the path, or fails after reporting an ambiguity.
find_feature_dir_by_prefix() {
  local repo_root="$1" branch="$2"
  local specs_dir="$repo_root/specs"
  local branch_name prefix=''
  branch_name="$(effective_branch_name "$branch")"

  if [[ $branch_name =~ ^([0-9]{8}-[0-9]{6})- ]]; then
    prefix="${BASH_REMATCH[1]}"
  elif [[ $branch_name =~ ^([0-9]{3,})- ]]; then
    prefix="${BASH_REMATCH[1]}"
  else
    # No prefix to match on: the branch name is the directory name.
    printf '%s\n' "$specs_dir/$branch_name"
    return 0
  fi

  local matches=() dir
  if [ -d "$specs_dir" ]; then
    for dir in "$specs_dir/$prefix"-*/; do
      [ -d "$dir" ] || continue
      matches+=("${dir%/}")
    done
  fi

  if [ "${#matches[@]}" -eq 0 ]; then
    printf '%s\n' "$specs_dir/$branch_name"
    return 0
  fi
  if [ "${#matches[@]}" -eq 1 ]; then
    printf '%s\n' "${matches[0]}"
    return 0
  fi

  # Two directories for one feature number is a mistake worth stopping on:
  # picking either one silently writes the plan into the wrong feature.
  local names=''
  for dir in "${matches[@]}"; do
    names="${names:+$names }$(basename "$dir")"
  done
  printf "ERROR: Multiple spec directories found with prefix '%s': %s\n" "$prefix" "$names" >&2
  printf 'Please ensure only one spec directory exists per prefix.\n' >&2
  return 1
}

# Assigns REPO_ROOT, CURRENT_BRANCH, HAS_GIT, FEATURE_DIR, FEATURE_SPEC,
# IMPL_PLAN, TASKS, RESEARCH, DATA_MODEL, QUICKSTART and CONTRACTS_DIR in the
# caller's shell. Exits 1 rather than returning empty paths, because every
# caller would otherwise go on to create files at the wrong place.
get_feature_paths() {
  REPO_ROOT="$(get_repo_root)"
  CURRENT_BRANCH="$(get_current_branch)"
  if has_git; then HAS_GIT=true; else HAS_GIT=false; fi

  # Priority: explicit env override, then the pin in .specify/feature.json
  # written by /speckit-specify, then the branch name's numeric prefix.
  local feature_json="$REPO_ROOT/.specify/feature.json"
  local pinned=''

  if [ -n "${SPECIFY_FEATURE_DIRECTORY:-}" ]; then
    pinned="$SPECIFY_FEATURE_DIRECTORY"
  elif [ -f "$feature_json" ]; then
    # A missing key falls through to the branch prefix, matching the
    # PowerShell side. Unlike it, a syntactically broken feature.json is not
    # reported as such: grep cannot tell malformed JSON from an absent key, and
    # pulling in a JSON parser to produce a nicer error is not worth it.
    pinned="$(json_string_value "$feature_json" 'feature_directory')"
  fi

  if [ -n "$pinned" ]; then
    case "$pinned" in
      /*) FEATURE_DIR="$pinned" ;;
      *) FEATURE_DIR="$REPO_ROOT/$pinned" ;;
    esac
  else
    if ! FEATURE_DIR="$(find_feature_dir_by_prefix "$REPO_ROOT" "$CURRENT_BRANCH")"; then
      printf 'ERROR: Failed to resolve feature directory\n' >&2
      exit 1
    fi
  fi

  FEATURE_SPEC="$FEATURE_DIR/spec.md"
  IMPL_PLAN="$FEATURE_DIR/plan.md"
  TASKS="$FEATURE_DIR/tasks.md"
  RESEARCH="$FEATURE_DIR/research.md"
  DATA_MODEL="$FEATURE_DIR/data-model.md"
  QUICKSTART="$FEATURE_DIR/quickstart.md"
  CONTRACTS_DIR="$FEATURE_DIR/contracts"
}

# --- reporting helpers -----------------------------------------------------

# These print the human-readable checklist in text mode. Note a divergence
# worth knowing about: the PowerShell equivalents pipe their own output to
# Out-Null at every call site, so `check-prerequisites.ps1` without -Json
# prints the "AVAILABLE_DOCS:" header and then nothing at all. That is a bug in
# the generated script, not a contract, so the bash side prints the lines. The
# -Json output, which is the half the speckit skills parse, is identical.
check_file() {
  local path="$1" description="$2"
  if [ -f "$path" ]; then
    printf '  [OK] %s\n' "$description"
    return 0
  fi
  printf '  [FAIL] %s\n' "$description"
  return 1
}

check_dir_has_files() {
  local path="$1" description="$2"
  if [ -d "$path" ] && [ -n "$(find "$path" -maxdepth 1 -type f -print -quit 2>/dev/null)" ]; then
    printf '  [OK] %s\n' "$description"
    return 0
  fi
  printf '  [FAIL] %s\n' "$description"
  return 1
}

# Escape a value for embedding in the compact JSON these scripts emit. Only
# backslash, double quote and the control characters can break the output, and
# ConvertTo-Json escapes exactly those. A path with a quote in it is unlikely
# and would still produce valid JSON rather than a broken parse in the skill.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g'
}

# --- template resolution ---------------------------------------------------

# List installed preset ids in resolution order. The order comes from
# .specify/presets/.registry when there is one -- honouring both `priority` and
# `enabled` -- and is alphabetical otherwise. The registry is real JSON with
# nested objects, which is past what grep should be asked to read, so this uses
# node: the repo already requires node >= 24 for infra/*.mjs, and this branch is
# only ever reached once a preset is actually installed (none is today).
list_presets_in_order() {
  local presets_dir="$1"
  local registry="$presets_dir/.registry"

  if [ -f "$registry" ] && command -v node >/dev/null 2>&1; then
    local ordered
    if ordered="$(node -e '
      const fs = require("node:fs");
      const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const presets = data.presets || {};
      const ids = Object.keys(presets)
        .filter((id) => presets[id]?.enabled !== false)
        .sort((a, b) => (presets[a]?.priority ?? 10) - (presets[b]?.priority ?? 10));
      process.stdout.write(ids.join("\n"));
    ' "$registry" 2>/dev/null)" && [ -n "$ordered" ]; then
      printf '%s\n' "$ordered"
      return 0
    fi
    # A registry we cannot read is not fatal; alphabetical order still resolves
    # a template, it just may pick the wrong layer when several provide one.
  fi

  local dir
  for dir in "$presets_dir"/*/; do
    [ -d "$dir" ] || continue
    local name
    name="$(basename "$dir")"
    case "$name" in .*) continue ;; esac
    printf '%s\n' "$name"
  done
}

# Resolve a template name to a file path through the override stack:
#   1. .specify/templates/overrides/  2. presets  3. extensions  4. core
# Prints the path, or nothing when the template is nowhere to be found.
resolve_template() {
  local template_name="$1" repo_root="$2"
  local base="$repo_root/.specify/templates"

  local override="$base/overrides/$template_name.md"
  if [ -f "$override" ]; then
    printf '%s\n' "$override"
    return 0
  fi

  local presets_dir="$repo_root/.specify/presets"
  if [ -d "$presets_dir" ]; then
    local preset_id
    while IFS= read -r preset_id; do
      [ -n "$preset_id" ] || continue
      local candidate="$presets_dir/$preset_id/templates/$template_name.md"
      if [ -f "$candidate" ]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done < <(list_presets_in_order "$presets_dir")
  fi

  local ext_dir="$repo_root/.specify/extensions"
  if [ -d "$ext_dir" ]; then
    local ext
    for ext in "$ext_dir"/*/; do
      [ -d "$ext" ] || continue
      case "$(basename "$ext")" in .*) continue ;; esac
      local candidate="${ext}templates/$template_name.md"
      if [ -f "$candidate" ]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done
  fi

  local core="$base/$template_name.md"
  if [ -f "$core" ]; then
    printf '%s\n' "$core"
    return 0
  fi

  return 1
}
