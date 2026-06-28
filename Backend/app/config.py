from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"

WHISPER_MODEL = "base"
WHISPER_LANGUAGE = "italian"

ALLOWED_EXTENSIONS = {".mp3", ".mp4"}
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
