#!/usr/bin/env bash
# Publishes a new Rizzoto installer as a release on the public repo installed
# apps update from. Runs in CI after `electron-builder`; does nothing if this
# version is already out, so it is safe on every push. The release is made as
# a draft and only published once every file is up, so apps never see a
# release without its installer.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${RIZZOTO_UPDATE_REPO:?}" "${GH_TOKEN:?}"
repo="$RIZZOTO_UPDATE_REPO"
version=$(node -p "require('./package.json').version")
tag="v$version"

if gh release view "$tag" --repo "$repo" --json isDraft -q .isDraft 2>/dev/null | grep -q false; then
  echo "Rizzoto $version is already out"
  exit 0
fi

live=$(gh release view --repo "$repo" --json tagName -q .tagName 2>/dev/null | sed 's/^v//' || true)
# never let an older build replace a newer one
newer=$(node -e "
  const [a, b] = process.argv.slice(1).map((v) => v.split('.').map(Number));
  console.log((a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0);
" "${live:-0.0.0}" "$version")
if [ "$newer" = true ]; then
  echo "Version $live is already out and newer than $version, bump window/package.json"
  exit 1
fi

installer="release/Rizzoto-Setup-$version.exe"
# a draft left behind by a failed run is replaced
gh release delete "$tag" --repo "$repo" --yes --cleanup-tag 2>/dev/null || true
gh release create "$tag" --repo "$repo" --draft \
  --title "Rizzoto $version" \
  --notes "Installed apps update to this on their own. For a new counter PC, download $(basename "$installer") below." \
  "$installer" "$installer.blockmap" release/latest.yml
gh release edit "$tag" --repo "$repo" --draft=false --latest
echo "Published Rizzoto $version (was ${live:-nothing})"
