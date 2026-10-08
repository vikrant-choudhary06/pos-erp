#!/usr/bin/env bash
# Uploads a new Rizzoto installer to the R2 bucket installed apps update from.
# Runs in CI after `electron-builder`; does nothing if this version is already
# live, so it is safe on every push. latest.yml goes last: apps only see the
# new version once its installer is fully there.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${RIZZOTO_UPDATE_URL:?}" "${R2_ACCOUNT_ID:?}" "${R2_BUCKET:?}"
version=$(node -p "require('./package.json').version")
live=$(curl -fsS "${RIZZOTO_UPDATE_URL%/}/latest.yml?t=$(date +%s)" 2>/dev/null | sed -n 's/^version: //p' || true)

if [ "$live" = "$version" ]; then
  echo "Rizzoto $version is already live"
  exit 0
fi
# never let an older build replace a newer one
newer=$(node -e "
  const [a, b] = process.argv.slice(1).map((v) => v.split('.').map(Number));
  console.log((a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0);
" "${live:-0.0.0}" "$version")
if [ "$newer" = true ]; then
  echo "Live version $live is newer than $version, bump window/package.json"
  exit 1
fi

export AWS_DEFAULT_REGION=auto
s3() { aws s3 cp --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" "$@"; }

installer="release/Rizzoto-Setup-$version.exe"
s3 "$installer" "s3://$R2_BUCKET/"
s3 "$installer.blockmap" "s3://$R2_BUCKET/"
s3 release/latest.yml "s3://$R2_BUCKET/" --cache-control "no-cache, max-age=0"
echo "Published Rizzoto $version (was ${live:-nothing})"
