#!/bin/bash
set -e

echo "========================================"
echo "Backfilling TMDB gaps"
echo "========================================"
echo ""

# Today (most important)
echo "📅 Backfilling today (2026-01-22)..."
npm run backfill:tmdb -- --start-date 2026-01-22 --end-date 2026-01-22 
echo ""

# Major gap periods (in chronological order)
echo "📅 Backfilling Jan 2025 gap (2025-01-15 to 2025-01-22)..."
npm run backfill:tmdb -- --start-date 2025-01-15 --end-date 2025-01-22
echo ""

echo "📅 Backfilling Apr 2025 gap (2025-04-22 to 2025-04-27)..."
npm run backfill:tmdb -- --start-date 2025-04-22 --end-date 2025-04-27
echo ""

echo "📅 Backfilling May 2025 gap (2025-05-01 to 2025-05-06)..."
npm run backfill:tmdb -- --start-date 2025-05-01 --end-date 2025-05-06 
echo ""

echo "📅 Backfilling Jun 2025 gap (2025-06-01 to 2025-06-09)..."
npm run backfill:tmdb -- --start-date 2025-06-01 --end-date 2025-06-09 
echo ""

echo "📅 Backfilling Nov 2025 gap #1 (2025-11-07 to 2025-11-11)..."
npm run backfill:tmdb -- --start-date 2025-11-07 --end-date 2025-11-11 
echo ""

echo "📅 Backfilling Nov 2025 gap #2 (2025-11-18 to 2025-11-23)..."
npm run backfill:tmdb -- --start-date 2025-11-18 --end-date 2025-11-23 
echo ""

echo "========================================"
echo "✅ All gaps backfilled successfully!"
echo "========================================"
