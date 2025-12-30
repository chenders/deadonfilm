import "dotenv/config"
import { getPool } from "../src/lib/db.js"

async function main() {
  const db = getPool()

  const queries: [string, string][] = [
    ["Total actors", "SELECT COUNT(*) as count FROM actors"],
    ["Deceased actors", "SELECT COUNT(*) as count FROM actors WHERE deathday IS NOT NULL"],
    [
      "Deceased is_obscure=true",
      "SELECT COUNT(*) as count FROM actors WHERE deathday IS NOT NULL AND is_obscure = true",
    ],
    [
      "Deceased is_obscure=false",
      "SELECT COUNT(*) as count FROM actors WHERE deathday IS NOT NULL AND is_obscure = false",
    ],
    [
      "Deceased is_obscure=NULL",
      "SELECT COUNT(*) as count FROM actors WHERE deathday IS NOT NULL AND is_obscure IS NULL",
    ],
    ["Total movies", "SELECT COUNT(*) as count FROM movies"],
    ["Total shows", "SELECT COUNT(*) as count FROM shows"],
  ]

  for (const [label, query] of queries) {
    try {
      const result = await db.query(query)
      const count = result.rows[0] ? result.rows[0].count : 0
      console.log(label + ": " + count)
    } catch (e) {
      console.log(label + ": ERROR - " + (e instanceof Error ? e.message : String(e)))
    }
  }

  console.log("\nSync state:")
  try {
    const result = await db.query(
      "SELECT sync_type, last_sync_date, last_run_at, items_processed FROM sync_state ORDER BY sync_type"
    )
    console.table(result.rows)
  } catch (e) {
    console.log("ERROR: " + (e instanceof Error ? e.message : String(e)))
  }

  await db.end()
  process.exit(0)
}

main()
