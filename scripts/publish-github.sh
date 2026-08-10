#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="congrongdesign/normix"

if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  export GH_TOKEN="$(security find-generic-password -s normix-github -a congrongdesign -w 2>/dev/null || true)"
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not installed."
  echo "Install it with: brew install gh"
  echo "Then run: gh auth login"
  exit 1
fi

gh auth status >/dev/null 2>&1 || {
  echo "GitHub CLI is not authenticated."
  echo "Run: gh auth login"
  exit 1
}

cd "$ROOT_DIR"

export GIT_ASKPASS="$ROOT_DIR/scripts/git-askpass.sh"
export GIT_TERMINAL_PROMPT=0

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  if ! gh repo create "$REPO" --public --source . --remote origin; then
    if ! gh repo view "$REPO" >/dev/null 2>&1; then
      echo "Repository creation failed."
      exit 1
    fi
  fi
fi

push_with_fallback() {
  echo "Pushing main and tags..."
  if git -c http.version=HTTP/1.1 push origin main --tags; then
    return 0
  fi
  echo "Direct push failed; retrying through gh-proxy.com..."
  git -c http.version=HTTP/1.1 push "https://gh-proxy.com/https://github.com/${REPO}.git" main --tags
}

push_with_fallback

if ! gh release view v1.0.0 >/dev/null 2>&1; then
  gh release create v1.0.0 $(find release -maxdepth 1 -type f ! -name ".DS_Store" ! -name "builder-debug.yml" ! -name "*.blockmap") --generate-notes
  echo "Release v1.0.0 created."
else
  echo "Release v1.0.0 already exists."
fi
