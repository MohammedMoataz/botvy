#!/usr/bin/env bash
# Create a new feature, the POSIX half of
# .specify/scripts/powershell/create-new-feature.ps1.
#
# Usage: ./create-new-feature.sh [--json] [--dry-run] [--allow-existing-branch]
#                               [--short-name <name>] [--number N] [--timestamp]
#                               <feature description>
#
# Nothing in .claude/skills invokes this today -- /speckit-specify creates the
# feature itself -- but it ships in every spec-kit script directory and a
# developer on Linux calling it by hand should get the same branch name, the
# same numbering and the same JSON as one on Windows. Numbering in particular
# has to agree: two people picking the same next number is a merge conflict in
# specs/ and two branches claiming to be feature 017.

set -euo pipefail

JSON=false
ALLOW_EXISTING_BRANCH=false
DRY_RUN=false
SHORT_NAME=''
NUMBER=0
TIMESTAMP=false
description_parts=()

USAGE='Usage: ./create-new-feature.sh [--json] [--dry-run] [--allow-existing-branch] [--short-name <name>] [--number N] [--timestamp] <feature description>'

show_help() {
  printf '%s\n\n' "$USAGE"
  printf 'Options:\n'
  printf '  --json                    Output in JSON format\n'
  printf '  --dry-run                 Compute branch name and paths without creating branches, directories, or files\n'
  printf '  --allow-existing-branch   Switch to branch if it already exists instead of failing\n'
  printf '  --short-name <name>       Provide a custom short name (2-4 words) for the branch\n'
  printf '  --number N                Specify branch number manually (overrides auto-detection)\n'
  printf '  --timestamp               Use timestamp prefix (YYYYMMDD-HHMMSS) instead of sequential numbering\n'
  printf '  --help                    Show this help message\n\n'
  printf 'Examples:\n'
  printf "  ./create-new-feature.sh 'Add user authentication system' --short-name 'user-auth'\n"
  printf "  ./create-new-feature.sh 'Implement OAuth2 integration for API'\n"
  printf "  ./create-new-feature.sh --timestamp --short-name 'user-auth' 'Add user authentication'\n"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=true ;;
    --allow-existing-branch) ALLOW_EXISTING_BRANCH=true ;;
    --dry-run) DRY_RUN=true ;;
    --timestamp) TIMESTAMP=true ;;
    --short-name)
      shift
      if [ $# -eq 0 ]; then
        printf 'ERROR: --short-name requires a value\n' >&2
        exit 1
      fi
      SHORT_NAME="$1"
      ;;
    --number)
      shift
      if [ $# -eq 0 ]; then
        printf 'ERROR: --number requires a value\n' >&2
        exit 1
      fi
      # Validated here rather than trusted: an unparsable value would silently
      # become 0 and re-run the auto-detection, which looks like the flag was
      # ignored.
      if ! [[ $1 =~ ^[0-9]+$ ]]; then
        printf 'ERROR: --number expects a non-negative integer, got: %s\n' "$1" >&2
        exit 1
      fi
      NUMBER=$((10#$1))
      ;;
    --help | -h)
      show_help
      exit 0
      ;;
    *) description_parts+=("$1") ;;
  esac
  shift
done

if [ "${#description_parts[@]}" -eq 0 ]; then
  printf '%s\n' "$USAGE" >&2
  exit 1
fi

FEATURE_DESC="$(printf '%s' "${description_parts[*]}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
# The sed above trims both ends; a description of nothing but whitespace lands
# here as empty and is refused, because it would produce a branch called "001-".
if [ -z "$FEATURE_DESC" ]; then
  printf 'ERROR: Feature description cannot be empty or contain only whitespace\n' >&2
  exit 1
fi

# shellcheck source=./common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# --- numbering -------------------------------------------------------------

# Highest sequential feature number among the given names. Timestamp-prefixed
# names are skipped: "20260319-143022-thing" starts with 8 digits and would
# otherwise be read as feature 20,260,319 and take the numbering with it.
highest_number_from_names() {
  local highest=0 name num digits
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if [[ $name =~ ^([0-9]{3,})- ]]; then
      # Captured before the next match is attempted. A second [[ =~ ]] clears
      # BASH_REMATCH, so testing the timestamp shape first and reading the
      # group afterwards blows up under `set -u` -- which is exactly how this
      # was caught, and why the two steps are in this order.
      digits="${BASH_REMATCH[1]}"
      if [[ ! $name =~ ^[0-9]{8}-[0-9]{6}- ]]; then
        num=$((10#$digits))
        if [ "$num" -gt "$highest" ]; then highest="$num"; fi
      fi
    fi
  done
  printf '%s\n' "$highest"
}

highest_number_from_specs() {
  local specs_dir="$1"
  if [ ! -d "$specs_dir" ]; then
    printf '0\n'
    return 0
  fi
  local dir
  for dir in "$specs_dir"/*/; do
    [ -d "$dir" ] || continue
    basename "$dir"
  done | highest_number_from_names
}

highest_number_from_branches() {
  # Local and remote-tracking branches both, with the decoration git adds
  # stripped: the leading "* " on the current branch and the "remotes/<name>/"
  # on a tracking ref. Collected first and counted second, so a git that fails
  # here yields an empty list rather than tripping pipefail and printing a
  # second number the caller's arithmetic would then choke on.
  local names
  names="$(git branch -a 2>/dev/null | sed 's/^[* ]*//; s#^remotes/[^/]*/##' || true)"
  printf '%s\n' "$names" | highest_number_from_names
}

# Read-only remote lookup. Used in dry-run, where fetching would be a side
# effect the caller explicitly asked us not to have.
highest_number_from_remote_refs() {
  local highest=0 remote refs remote_highest
  local remotes
  remotes="$(git remote 2>/dev/null || true)"
  for remote in $remotes; do
    # No credential prompt: an unauthenticated remote must fail fast rather
    # than block the script forever waiting on a password nobody will type.
    if refs="$(GIT_TERMINAL_PROMPT=0 git ls-remote --heads "$remote" 2>/dev/null)"; then
      remote_highest="$(printf '%s\n' "$refs" | sed -n 's#.*refs/heads/##p' | highest_number_from_names)"
      if [ "$remote_highest" -gt "$highest" ]; then highest="$remote_highest"; fi
    fi
  done
  printf '%s\n' "$highest"
}

# next_branch_number <specs_dir> [skip_fetch]
next_branch_number() {
  local specs_dir="$1" skip_fetch="${2:-false}"
  local highest_branch highest_remote highest_spec

  if [ "$skip_fetch" = true ]; then
    highest_branch="$(highest_number_from_branches)"
    highest_remote="$(highest_number_from_remote_refs)"
    if [ "$highest_remote" -gt "$highest_branch" ]; then highest_branch="$highest_remote"; fi
  else
    # Fetch so a number already taken on a remote is not handed out again.
    # Failure is fine and common: there may be no remote at all.
    git fetch --all --prune >/dev/null 2>&1 || true
    highest_branch="$(highest_number_from_branches)"
  fi

  highest_spec="$(highest_number_from_specs "$specs_dir")"

  local max_num="$highest_branch"
  if [ "$highest_spec" -gt "$max_num" ]; then max_num="$highest_spec"; fi
  printf '%s\n' "$((max_num + 1))"
}

# --- branch naming ---------------------------------------------------------

clean_branch_name() {
  printf '%s' "$1" |
    tr '[:upper:]' '[:lower:]' |
    sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//'
}

# Turn a sentence into a 3-4 word slug. The stop-word list is what keeps
# "I want to add a feature for tracking habits" from becoming
# "i-want-to" -- the first three words of a request are almost never the
# subject of it.
branch_name_from_description() {
  local description="$1"
  local stop_words=' i a an the to for of in on at by with from is are was were be been being have has had do does did will would should could can may might must shall this that these those my your our their want need add get set '

  local clean_name words word meaningful=()
  clean_name="$(printf '%s' "$description" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/ /g')"
  # Deliberately unquoted: word splitting is the parse.
  # shellcheck disable=SC2206
  words=($clean_name)

  for word in ${words[@]+"${words[@]}"}; do
    case "$stop_words" in *" $word "*) continue ;; esac

    if [ "${#word}" -ge 3 ]; then
      meaningful+=("$word")
    elif printf '%s' "$description" | grep -qE "\b$(printf '%s' "$word" | tr '[:lower:]' '[:upper:]')\b"; then
      # A one or two letter word survives only if it was capitalised in the
      # original, which is the cheap tell for an acronym: "AI", "UI", "S3".
      meaningful+=("$word")
    fi
  done

  if [ "${#meaningful[@]}" -gt 0 ]; then
    # Exactly four meaningful words are all kept; five or more are cut to
    # three, on the theory that four words that survived filtering are the
    # whole of a short title, while five are the start of a long one.
    local max_words=3
    if [ "${#meaningful[@]}" -eq 4 ]; then max_words=4; fi
    local result='' i=0
    for word in "${meaningful[@]}"; do
      [ "$i" -lt "$max_words" ] || break
      result="${result:+$result-}$word"
      i=$((i + 1))
    done
    printf '%s\n' "$result"
    return 0
  fi

  # Nothing meaningful left -- a description of nothing but stop words. Fall
  # back to the first three segments of the whole thing rather than emit "".
  local fallback fallback_parts
  fallback="$(clean_branch_name "$description")"
  IFS='-' read -r -a fallback_parts <<<"$fallback"
  local result='' i=0
  for word in ${fallback_parts[@]+"${fallback_parts[@]}"}; do
    [ -n "$word" ] || continue
    [ "$i" -lt 3 ] || break
    result="${result:+$result-}$word"
    i=$((i + 1))
  done
  printf '%s\n' "$result"
}

# --- main ------------------------------------------------------------------

REPO_ROOT="$(get_repo_root)"
if has_git; then HAS_GIT=true; else HAS_GIT=false; fi

cd "$REPO_ROOT"

SPECS_DIR="$REPO_ROOT/specs"
if [ "$DRY_RUN" = false ]; then
  mkdir -p "$SPECS_DIR"
fi

if [ -n "$SHORT_NAME" ]; then
  BRANCH_SUFFIX="$(clean_branch_name "$SHORT_NAME")"
else
  BRANCH_SUFFIX="$(branch_name_from_description "$FEATURE_DESC")"
fi

if [ "$TIMESTAMP" = true ] && [ "$NUMBER" -ne 0 ]; then
  printf 'WARNING: [specify] Warning: --number is ignored when --timestamp is used\n' >&2
  NUMBER=0
fi

if [ "$TIMESTAMP" = true ]; then
  FEATURE_NUM="$(date +%Y%m%d-%H%M%S)"
  BRANCH_NAME="$FEATURE_NUM-$BRANCH_SUFFIX"
else
  if [ "$NUMBER" -eq 0 ]; then
    if [ "$DRY_RUN" = true ] && [ "$HAS_GIT" = true ]; then
      NUMBER="$(next_branch_number "$SPECS_DIR" true)"
    elif [ "$DRY_RUN" = true ]; then
      NUMBER=$(($(highest_number_from_specs "$SPECS_DIR") + 1))
    elif [ "$HAS_GIT" = true ]; then
      NUMBER="$(next_branch_number "$SPECS_DIR")"
    else
      NUMBER=$(($(highest_number_from_specs "$SPECS_DIR") + 1))
    fi
  fi
  FEATURE_NUM="$(printf '%03d' "$NUMBER")"
  BRANCH_NAME="$FEATURE_NUM-$BRANCH_SUFFIX"
fi

# GitHub refuses a branch name over 244 bytes, and the refusal arrives at push
# time -- long after the spec directory has been created under the long name.
# Truncating here keeps the two in step.
MAX_BRANCH_LENGTH=244
if [ "${#BRANCH_NAME}" -gt "$MAX_BRANCH_LENGTH" ]; then
  prefix_length=$((${#FEATURE_NUM} + 1))
  max_suffix_length=$((MAX_BRANCH_LENGTH - prefix_length))
  truncated_suffix="${BRANCH_SUFFIX:0:$max_suffix_length}"
  truncated_suffix="${truncated_suffix%-}"
  original_branch_name="$BRANCH_NAME"
  BRANCH_NAME="$FEATURE_NUM-$truncated_suffix"

  printf "WARNING: [specify] Branch name exceeded GitHub's 244-byte limit\n" >&2
  printf 'WARNING: [specify] Original: %s (%s bytes)\n' "$original_branch_name" "${#original_branch_name}" >&2
  printf 'WARNING: [specify] Truncated to: %s (%s bytes)\n' "$BRANCH_NAME" "${#BRANCH_NAME}" >&2
fi

FEATURE_DIR="$SPECS_DIR/$BRANCH_NAME"
SPEC_FILE="$FEATURE_DIR/spec.md"

if [ "$DRY_RUN" = false ]; then
  if [ "$HAS_GIT" = true ]; then
    branch_created=false
    branch_create_error=''
    if branch_create_error="$(git checkout -q -b "$BRANCH_NAME" 2>&1)"; then
      branch_created=true
    fi

    if [ "$branch_created" = false ]; then
      current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
      existing_branch="$(git branch --list "$BRANCH_NAME" 2>/dev/null || true)"

      if [ -n "$existing_branch" ]; then
        if [ "$ALLOW_EXISTING_BRANCH" = true ]; then
          if [ "$current_branch" = "$BRANCH_NAME" ]; then
            : # Already on the target branch -- nothing to do.
          else
            if ! switch_error="$(git checkout -q "$BRANCH_NAME" 2>&1)"; then
              if [ -n "$switch_error" ]; then
                printf "ERROR: Branch '%s' exists but could not be checked out.\n%s\n" "$BRANCH_NAME" "$switch_error" >&2
              else
                printf "ERROR: Branch '%s' exists but could not be checked out. Resolve any uncommitted changes or conflicts and try again.\n" "$BRANCH_NAME" >&2
              fi
              exit 1
            fi
          fi
        elif [ "$TIMESTAMP" = true ]; then
          printf "ERROR: Branch '%s' already exists. Rerun to get a new timestamp or use a different --short-name.\n" "$BRANCH_NAME" >&2
          exit 1
        else
          printf "ERROR: Branch '%s' already exists. Please use a different feature name or specify a different number with --number.\n" "$BRANCH_NAME" >&2
          exit 1
        fi
      else
        if [ -n "$branch_create_error" ]; then
          printf "ERROR: Failed to create git branch '%s'.\n%s\n" "$BRANCH_NAME" "$branch_create_error" >&2
        else
          printf "ERROR: Failed to create git branch '%s'. Please check your git configuration and try again.\n" "$BRANCH_NAME" >&2
        fi
        exit 1
      fi
    fi
  else
    printf 'WARNING: [specify] Warning: Git repository not detected; skipped branch creation for %s\n' "$BRANCH_NAME" >&2
  fi

  mkdir -p "$FEATURE_DIR"

  # Never clobber an existing spec.md: re-running this against a feature that
  # already has one would throw away whatever was written into it.
  if [ ! -f "$SPEC_FILE" ]; then
    if template="$(resolve_template 'spec-template' "$REPO_ROOT")" && [ -f "$template" ]; then
      cp "$template" "$SPEC_FILE"
    else
      : >"$SPEC_FILE"
    fi
  fi

  # Exported for anything this script itself goes on to run. It cannot reach
  # the calling shell -- neither can the PowerShell version when invoked with
  # -File -- so the line printed below is a statement of the value to use, not
  # a promise that the caller's environment now holds it.
  export SPECIFY_FEATURE="$BRANCH_NAME"
fi

if [ "$JSON" = true ]; then
  dry_run_field=''
  if [ "$DRY_RUN" = true ]; then
    dry_run_field=',"DRY_RUN":true'
  fi
  printf '{"BRANCH_NAME":"%s","SPEC_FILE":"%s","FEATURE_NUM":"%s","HAS_GIT":%s%s}\n' \
    "$(json_escape "$BRANCH_NAME")" \
    "$(json_escape "$SPEC_FILE")" \
    "$(json_escape "$FEATURE_NUM")" \
    "$HAS_GIT" \
    "$dry_run_field"
else
  printf 'BRANCH_NAME: %s\n' "$BRANCH_NAME"
  printf 'SPEC_FILE: %s\n' "$SPEC_FILE"
  printf 'FEATURE_NUM: %s\n' "$FEATURE_NUM"
  if [ "$HAS_GIT" = true ]; then printf 'HAS_GIT: True\n'; else printf 'HAS_GIT: False\n'; fi
  if [ "$DRY_RUN" = false ]; then
    printf 'SPECIFY_FEATURE environment variable set to: %s\n' "$BRANCH_NAME"
  fi
fi
