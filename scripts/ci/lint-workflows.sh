#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
artifact_dir="$PWD/.playwright-mcp/ci-separation/actionlint"
mkdir -p "$artifact_dir"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    platform=linux_amd64
    checksum=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
    ;;
  Darwin-arm64)
    platform=darwin_arm64
    checksum=aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f
    ;;
  *) echo 'Unsupported actionlint platform' >&2; exit 1 ;;
esac
archive="$artifact_dir/actionlint_1.7.12_${platform}.tar.gz"
curl --fail --silent --show-error --location \
  "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_${platform}.tar.gz" \
  --output "$archive"
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$archive")
else
  actual=$(shasum -a 256 "$archive")
fi
test "${actual%% *}" = "$checksum"
tar -xzf "$archive" -C "$artifact_dir" actionlint
"$artifact_dir/actionlint" -version
"$artifact_dir/actionlint" -color .github/workflows/ci.yml .github/workflows/deploy.yml
