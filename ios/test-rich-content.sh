#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test_binary="$(mktemp -t career-rich-content.XXXXXX)"
trap 'rm -f "$test_binary"' EXIT
swiftc \
  ios/CareerNote/Sources/CareerRichText.swift \
  ios/Tests/RichContentSmoke.swift \
  -o "$test_binary"
"$test_binary"
