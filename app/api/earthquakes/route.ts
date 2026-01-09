import { NextResponse } from "next/server";
import pool from "@/db/db";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const dataset = searchParams.get("dataset");

    const params: string[] = [];
    let where = "";

    if (dataset) {
        params.push(dataset);
        where = `WHERE d.name = $1`;
    }

    const result = await pool.query(
        `
    SELECT
      e.event_id,
      e.time,
      e.magnitude,
      e.depth_km,
      e.lat,
      e.lon
    FROM earthquakes e
    JOIN datasets d ON d.id = e.dataset_id
    ${where}
    ORDER BY e.time DESC
    LIMIT 2000
    `,
        params
    );

    return NextResponse.json(result.rows);
}
