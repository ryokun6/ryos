#!/usr/bin/env bash
# Dev only: ensure api -> _api symlink exists for local vercel dev (Vercel serves from api/ by default).
# The symlink is gitignored and not used in production.
set -e
if [ ! -d _api ]; then
  echo "_api/ not found" >&2
  exit 1
fi
if [ -L api ] && [ "$(readlink api)" = "_api" ]; then
  exit 0
fi
if [ -e api ]; then
  rm -rf api
fi
ln -s _api api
echo "api -> _api symlink created"
