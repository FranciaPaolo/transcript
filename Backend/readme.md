# Backend of the webtranscript
This is the backend written in Python,
using Fastapi and Whisper for transcriptions.

**To debug;** webapp will listen at http://localhost:8000\
Create a virtual environment\
```conda create -p venv python=3.10```

Activate the virtual environment\
```conda active ./venv```

Start the backend\
```python -m app.main```

## Post /api/transcribe
Generate the transcript of a file. This method is async so to get the progress and the result you need to poll the /jobs/{jobid}.

file: mp3 or mp4 for transcription


## Get /api/jobs/{id}

This method is to get the progress and the result of the transcript.

Parameters
* jobid: This is job id returned by the /api/transcribe method

