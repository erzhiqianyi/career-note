#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test_binary="$(mktemp -t career-speech-audio.XXXXXX)"
trap 'rm -f "$test_binary"' EXIT
swiftc ios/CareerNote/Sources/SpeechAudioChunks.swift ios/Tests/SpeechAudioSmoke.swift -o "$test_binary"
"$test_binary"
