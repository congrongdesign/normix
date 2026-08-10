#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="congrongdesign/normix"

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

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --source . --remote origin --push
else
  git push -u origin main --tags
fi

git push origin --tags

if ! gh release view v1.0.0 >/dev/null 2>&1; then
  gh release create v1.0.0 $(find release -maxdepth 1 -type f ! -name ".DS_Store" ! -name "builder-debug.yml" ! -name "*.blockmap") --generate-notes
  echo "Release v1.0.0 created."
else
  echo "Release v1.0.0 already exists."
fi
