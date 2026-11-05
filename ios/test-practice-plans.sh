#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test_binary="$(mktemp -t career-practice-plans.XXXXXX)"
trap 'rm -f "$test_binary"' EXIT
swiftc -lsqlite3 ios/CareerNote/Sources/Models.swift ios/CareerNote/Sources/LocalStore.swift \
  ios/Tests/PracticePlanSmoke.swift -o "$test_binary"
"$test_binary"
