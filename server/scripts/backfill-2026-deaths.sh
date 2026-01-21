#!/bin/bash
# Backfill deaths from 2026-01-01 to today in 2-day chunks with resumption
# Usage: ./backfill-2026-deaths.sh [options]
#
# Options:
#   -n, --dry-run        Preview changes without writing to database
#   -p, --people-only    Only sync people changes (default)
#   -m, --movies-only    Only sync movie changes
#   -s, --shows-only     Only sync active TV show episodes
#   --reset              Clear checkpoint and start from beginning
#   -h, --help           Display help

set -e  # Exit on error

# Default values
RESET=false
CHECKPOINT_FILE="./scripts/.backfill-checkpoint"
SYNC_ARGS=()

# Show help
function show_help() {
  echo "Backfill deaths from 2026-01-01 to today in 2-day chunks"
  echo ""
  echo "Usage: ./backfill-2026-deaths.sh [options]"
  echo ""
  echo "Options:"
  echo "  -n, --dry-run        Preview changes without writing to database"
  echo "  -p, --people-only    Only sync people changes (default)"
  echo "  -m, --movies-only    Only sync movie changes"
  echo "  -s, --shows-only     Only sync active TV show episodes"
  echo "  --reset              Clear checkpoint and start from beginning"
  echo "  -h, --help           Display this help message"
  echo ""
  echo "Examples:"
  echo "  ./backfill-2026-deaths.sh --dry-run"
  echo "  ./backfill-2026-deaths.sh --people-only"
  echo "  ./backfill-2026-deaths.sh --reset"
  exit 0
}

# Parse arguments
PEOPLE_ONLY=true  # Default to people-only
for arg in "$@"; do
  case $arg in
    -n|--dry-run)
      SYNC_ARGS+=("--dry-run")
      ;;
    -p|--people-only)
      PEOPLE_ONLY=true
      ;;
    -m|--movies-only)
      PEOPLE_ONLY=false
      SYNC_ARGS+=("--movies-only")
      ;;
    -s|--shows-only)
      PEOPLE_ONLY=false
      SYNC_ARGS+=("--shows-only")
      ;;
    --reset)
      RESET=true
      ;;
    -h|--help)
      show_help
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Add people-only if it's still the default
if [ "$PEOPLE_ONLY" = true ]; then
  SYNC_ARGS+=("--people-only")
fi

# Show mode
for arg in "${SYNC_ARGS[@]}"; do
  case $arg in
    --dry-run)
      echo "DRY RUN MODE - no changes will be written"
      ;;
    --people-only)
      echo "People only mode"
      ;;
    --movies-only)
      echo "Movies only mode"
      ;;
    --shows-only)
      echo "Shows only mode"
      ;;
  esac
done

# Handle reset
if [ "$RESET" = true ]; then
  if [ -f "$CHECKPOINT_FILE" ]; then
    rm "$CHECKPOINT_FILE"
    echo "Checkpoint cleared. Starting from beginning."
  fi
fi

START_DATE="2026-01-01"
END_DATE=$(date +%Y-%m-%d)  # Today

# Convert dates to seconds since epoch
start_epoch=$(date -j -f "%Y-%m-%d" "$START_DATE" "+%s")
end_epoch=$(date -j -f "%Y-%m-%d" "$END_DATE" "+%s")

# Counter for progress
total_days=$(( ($end_epoch - $start_epoch) / 86400 ))
total_chunks=$(( ($total_days + 1) / 2 ))

# Check for checkpoint
current_epoch=$start_epoch
current_chunk=0

if [ -f "$CHECKPOINT_FILE" ]; then
  checkpoint_epoch=$(cat "$CHECKPOINT_FILE")
  if [ "$checkpoint_epoch" -ge "$start_epoch" ] && [ "$checkpoint_epoch" -le "$end_epoch" ]; then
    current_epoch=$checkpoint_epoch
    # Calculate which chunk number we're on
    days_from_start=$(( ($current_epoch - $start_epoch) / 86400 ))
    current_chunk=$(( $days_from_start / 2 ))
    checkpoint_date=$(date -j -r "$checkpoint_epoch" "+%Y-%m-%d")
    echo "========================================"
    echo "RESUMING from checkpoint: $checkpoint_date"
    echo "Skipping first $current_chunk chunk(s)"
    echo "========================================"
    echo ""
  else
    echo "Checkpoint is outside date range, ignoring..."
  fi
fi

echo "Backfilling from $START_DATE to $END_DATE"
echo "Running in 2-day chunks..."
echo ""

# Trap to save checkpoint on exit (even if interrupted)
function save_checkpoint() {
  if [ -n "$current_epoch" ] && [ "$current_epoch" -le "$end_epoch" ]; then
    echo "$current_epoch" > "$CHECKPOINT_FILE"
    checkpoint_date=$(date -j -r "$current_epoch" "+%Y-%m-%d")
    echo ""
    echo "Checkpoint saved at: $checkpoint_date"
  fi
}

trap save_checkpoint EXIT INT TERM

while [ $current_epoch -le $end_epoch ]; do
  current_chunk=$((current_chunk + 1))

  # Calculate chunk start and end dates
  chunk_start=$(date -j -r "$current_epoch" "+%Y-%m-%d")
  chunk_end_epoch=$((current_epoch + 86400))  # +1 day (we'll do 2-day ranges)

  # Don't go past the end date
  if [ $chunk_end_epoch -gt $end_epoch ]; then
    chunk_end_epoch=$end_epoch
  fi

  chunk_end=$(date -j -r "$chunk_end_epoch" "+%Y-%m-%d")

  echo "========================================"
  echo "Chunk $current_chunk of $total_chunks"
  echo "Processing: $chunk_start to $chunk_end"
  echo "========================================"

  # Run the sync with all passed arguments
  node dist/scripts/sync-tmdb-changes.js \
    --start-date "$chunk_start" \
    --end-date "$chunk_end" \
    "${SYNC_ARGS[@]}"

  echo ""

  # Move to next chunk (skip 2 days)
  current_epoch=$((current_epoch + 172800))  # +2 days

  # Save checkpoint after successful chunk
  echo "$current_epoch" > "$CHECKPOINT_FILE"

  # Small delay to be nice to the API
  sleep 2
done

# Clear checkpoint on successful completion
if [ -f "$CHECKPOINT_FILE" ]; then
  rm "$CHECKPOINT_FILE"
fi

echo "========================================"
echo "Backfill complete!"
echo "========================================"
