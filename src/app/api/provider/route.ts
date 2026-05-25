import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { speedTestsTable } from '@/db/schema';
import { ilike } from "drizzle-orm";

const querySchema = z.object({
  host: z.string().min(1).regex(/^[a-zA-Z0-9.-]+$/)
});

export async function GET(request: Request) {
  try {
    // Check if database is available
    if (!db) {
      return NextResponse.json({ data: [] });
    }

    const { searchParams } = new URL(request.url);
    const host = searchParams.get('host');
    
    const validation = querySchema.safeParse({ host });
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid host format' }, { status: 400 });
    }

    const results = await db
      .select({
        id: speedTestsTable.id,
        baseUrl: speedTestsTable.baseUrl,
        timestamp: speedTestsTable.timestamp
      })
      .from(speedTestsTable)
      .where(ilike(speedTestsTable.baseUrl, `%${host}%`));

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error('Error fetching providers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
