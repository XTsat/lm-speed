import { NextResponse } from "next/server";
import { db } from "@/db";
import { speedTestsTable, speedTestResultsTable } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { getQuery } from "ufo";

export interface TestResult {
  id: number;
  timestamp: string;
  baseUrl: string;
  avgTokensPerSecond: number;
  avgFirstTokenLatency: number;
  model: string;
}

const recentQuerySchema = z.object({
  host: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    // 如果数据库不可用，返回空数组
    if (!db) {
      return NextResponse.json({ recentTests: [] });
    }

    const searchParams = getQuery(request.url);

    const query = recentQuerySchema.parse({
      host: searchParams.host || undefined,
    });

    // 获取最近的 5 条测试记录，包含其详细结果
    const recentTests = await db
      .select({
        id: speedTestsTable.id,
        timestamp: speedTestsTable.timestamp,
        baseUrl: speedTestsTable.baseUrl,
        avgTokensPerSecond: sql<number>`AVG(${speedTestResultsTable.tokensPerSecond})`,
        avgFirstTokenLatency: sql<number>`AVG(${speedTestResultsTable.firstTokenLatency})`,
        model: speedTestResultsTable.model,
      })
      .from(speedTestsTable)
      .leftJoin(
        speedTestResultsTable,
        sql`${speedTestsTable.id} = ${speedTestResultsTable.speedTestId}`
      )
      .groupBy(
        speedTestsTable.id,
        speedTestsTable.timestamp,
        speedTestsTable.baseUrl,
        speedTestResultsTable.model
      )
      .orderBy(desc(speedTestsTable.timestamp))
      .where(
        query.host
          ? sql`${speedTestsTable.baseUrl} ILIKE ${`%${query.host}%`}`
          : sql`1=1`
      )
      .limit(5);

    return NextResponse.json({ recentTests });
  } catch (error) {
    console.error("Error fetching recent tests:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent tests" },
      { status: 500 }
    );
  }
}
