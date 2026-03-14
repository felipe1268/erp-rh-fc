#!/bin/bash
set -e
export NODE_ENV=production
export PORT=${PORT:-5000}
node dist/index.js
