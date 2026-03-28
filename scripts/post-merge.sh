#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "[post-merge] Done."
