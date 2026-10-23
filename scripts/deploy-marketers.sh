#!/usr/bin/env bash
# Deploy Betese Marketers + the sendOtp fix to the live Aviator project.
# Run from the repo root on a machine logged in with `firebase login`.
set -euo pipefail

PROJECT=beteseaviator-a05ae
cd "$(dirname "$0")/.."

git pull --ff-only origin main
(cd functions && npm ci && npm run build && npm test)

echo "1/3 Firestore indexes"
firebase deploy --only firestore:indexes --project "$PROJECT"
echo "1/3 done. New indexes build in the background (a few minutes); marketer"
echo "dashboards show errors until they are Enabled in the Firebase console."

echo "2/3 Firestore rules"
firebase deploy --only firestore:rules --project "$PROJECT"

echo "3/3 Functions (includes sendOtp fix, marketers, marketersDailySync)"
echo "If asked to DELETE functions that are not in the code, answer No."
firebase deploy --only functions --project "$PROJECT"

echo "Done. Check https://beteseaviator.com/api/health and sign in at /s as a marketer."
