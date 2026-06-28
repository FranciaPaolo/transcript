#!/bin/bash

# 1. Initialize Conda for use in this script
# Replace the path below if your conda installation is in a different location
source ~/anaconda3/etc/profile.d/conda.sh

# 2. Activate the local environment
conda activate ./venv

# 3. Check if a filename was provided
if [ -z "$1" ]; then
    echo "Error: Please provide an audio file. Usage: ./transcribe.sh filename.mp3"
    exit 1
fi

# 4. Run the transcription
whisper "$1" --language Italian --model base
