#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Pass a booted iOS Simulator UDID, or use the only booted simulator.
simulator="${1:-booted}"
test_directory="$(mktemp -d -t career-reference-speech)"
trap 'rm -rf "$test_directory"' EXIT
xcrun --sdk iphonesimulator swiftc \
  -target "$(uname -m)-apple-ios17.0-simulator" \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  ios/CareerNote/Sources/CareerRichText.swift \
  ios/CareerNote/Sources/ReferenceSpeech.swift \
  ios/Tests/ReferenceSpeechSmoke.swift \
  -o "$test_directory/reference-speech"
xcrun simctl spawn "$simulator" "$test_directory/reference-speech"
