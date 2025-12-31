#!/bin/bash
# Run the Video to Steps server

cd "$(dirname "$0")"

# Load .env if exists
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Activate venv
source .venv/bin/activate

# Run server
python server.py
