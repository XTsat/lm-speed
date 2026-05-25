import { NextResponse } from "next/server";
import { db } from "@/db";
import { desc, asc, sql, eq, inArray, and } from "drizzle-orm";
import { speedTestsTable, speedTestResultsTable } from "@/db/schema";
import { z } from "zod";
import { getQuery } from "ufo";

const rankQuerySchema = z.object({
  searchModel: z.string().optional(),
  listModel: z.string().array().optional(),
  baseUrl: z.string().optional(),
  timeRange: z.enum(['day', 'week', 'month', 'all']).optional().default('week'),
  metric: z.enum(['tokensPerSecond', 'firstTokenLatency']).optional().default('tokensPerSecond'),
  limit: z.number().min(1).max(100).optional().default(50),
});

export async function GET(request: Request) {
  try {
    // 如果数据库不可用，返回空数组
    if (!db) {
      return NextResponse.json({ results: [] });
    }

    const searchParams = getQuery(request.url);

    const query = rankQuerySchema.parse({
      searchModel: searchParams.searchModel === "all" ? undefined : searchParams.searchModel || undefined,
      baseUrl: searchParams.baseUrl || undefined,
      timeRange: searchParams.timeRange || undefined,
      metric: searchParams.metric || undefined,
      limit: searchParams.limit ? parseInt(searchParams.limit as string) : undefined,
      listModel: searchParams.listModel ? (Array.isArray(searchParams.listModel) ? searchParams.listModel : searchParams.listModel.split(',')) : undefined,
    });

    let timeFilter = sql`1=1`;
    if (query.timeRange !== 'all') {
      const timeMap = {
        day: 1,
        week: 7,
        month: 30,
      };
      const days = timeMap[query.timeRange as keyof typeof timeMap];
      timeFilter = sql`${speedTestsTable.timestamp} >= NOW() - INTERVAL '${days} days'`;
    }

    const results = await db
      .select({
        model: speedTestResultsTable.model,
        baseUrl: speedTestsTable.baseUrl,
        maxTokensPerSecond: sql<number>`MAX(${speedTestResultsTable.tokensPerSecond})`,
        minTokensPerSecond: sql<number>`MIN(${speedTestResultsTable.tokensPerSecond})`,
        avgTokensPerSecond: sql<number>`AVG(${speedTestResultsTable.tokensPerSecond})`,
        avgTokensPerSecondTotal: sql<number>`AVG(${speedTestResultsTable.tokensPerSecondTotal})`,
        maxFirstTokenLatency: sql<number>`MAX(${speedTestResultsTable.firstTokenLatency})`,
        minFirstTokenLatency: sql<number>`MIN(${speedTestResultsTable.firstTokenLatency})`,
        avgFirstTokenLatency: sql<number>`AVG(${speedTestResultsTable.firstTokenLatency})`,
        totalTests: sql<number>`COUNT(*)`,
      })
      .from(speedTestsTable)
      .innerJoin(
        speedTestResultsTable,
        eq(speedTestsTable.id, speedTestResultsTable.speedTestId)
      )
      .where(
        and(
          query.searchModel ? sql`${speedTestResultsTable.model} ILIKE ${`%${query.searchModel}%`}` : sql`1=1`,
          query.baseUrl ? eq(speedTestsTable.baseUrl, query.baseUrl) : sql`1=1`,
          timeFilter,
          query.listModel ? inArray(speedTestResultsTable.model, query.listModel) : sql`1=1`
        )
      )
      .groupBy(speedTestResultsTable.model, speedTestsTable.baseUrl)
      .orderBy(
        query.metric === 'tokensPerSecond' 
          ? desc(sql`AVG(${speedTestResultsTable.tokensPerSecond})`)
          : asc(sql`AVG(${speedTestResultsTable.firstTokenLatency})`)
      )
      .limit(query.limit);

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}