#!/bin/bash
# Caveman Compression wrapper — NLP-based (free, offline)
# Usage:
#   ./tools/caveman-compress.sh compress "Your verbose text here"
#   ./tools/caveman-compress.sh compress -f docs/architecture.md
#   ./tools/caveman-compress.sh compress -f docs/architecture.md -o docs/architecture.md
#   ./tools/caveman-compress.sh decompress "Compressed text"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/caveman-compression/venv"
COMPRESS_SCRIPT="$SCRIPT_DIR/caveman-compression/caveman_compress_nlp.py"

if [ ! -d "$VENV_DIR" ]; then
  echo "Error: Virtual environment not found at $VENV_DIR"
  echo "Run setup first:"
  echo "  cd tools/caveman-compression && python3 -m venv venv && source venv/bin/activate"
  echo "  pip install -r requirements-nlp.txt && python -m spacy download en_core_web_sm"
  exit 1
fi

source "$VENV_DIR/bin/activate"
python "$COMPRESS_SCRIPT" "$@" 2>/dev/null
