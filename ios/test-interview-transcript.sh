#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test_binary="$(mktemp -t career-interview-transcript.XXXXXX)"
trap 'rm -f "$test_binary"' EXIT
swiftc ios/CareerNote/Sources/Models.swift ios/CareerNote/Sources/InterviewStore.swift \
  ios/Tests/InterviewTranscriptSmoke.swift -o "$test_binary"
"$test_binary"
