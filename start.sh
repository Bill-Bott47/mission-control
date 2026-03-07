#!/bin/bash
# JonathanOS v2 Launch Script

cd "$(dirname "$0")"

# Ensure node/openclaw are in PATH for launchd environments
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the server
echo "Starting JonathanOS v1..."
echo "Dashboard available at: http://localhost:8888"
python server.py