#!/bin/bash
# Run the Video to Steps server

cd "$(dirname "$0")"

# Load shared env from ~/dev/.env.local
if [ -f ~/dev/.env.local ]; then
    export $(cat ~/dev/.env.local | grep -v '#' | xargs)
fi

# Load local .env if exists (overrides)
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Activate venv
source .venv/bin/activate

# Run server
python server.py
