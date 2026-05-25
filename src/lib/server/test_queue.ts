import Queue from 'bull';
import OpenAI from 'openai';
import { z } from 'zod';
import { db } from '@/db';
import { speedTestsTable, speedTestResultsTable } from '@/db/schema';
import { TEST_SUITES, TestSuiteId } from './test_suites';

// Simple token estimation function using character count
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Input validation schema
const speedTestQueueSchema = z.object({
    baseUrl: z.string().url(),
    apiKey: z.string(),
    modelId: z.string(),
    count: z.number().min(1).max(10).default(1),
    testSuite: z.enum(['general', 'technical', 'creative'] as const).default('general'),
});

export const speedTestQueue = new Queue('speedTest', process.env.REDIS_URL!);

// 处理 AI 评论生成任务
speedTestQueue.process(async (job, done) => {
    try {
        // Validate input data
        const validatedData = speedTestQueueSchema.parse(job.data);
        console.log('queue start', validatedData);

        // Check if database is available
        if (!db) {
            throw new Error('Database not available');
        }

        const client = new OpenAI({
            baseURL: validatedData.baseUrl,
            apiKey: validatedData.apiKey,
        });

        const timestamp = new Date().toISOString();
        const results = [];
        const selectedSuite = TEST_SUITES[validatedData.testSuite];

        // Create speed test record
        const [speedTest] = await db.insert(speedTestsTable)
            .values({
                timestamp: new Date(timestamp),
                baseUrl: validatedData.baseUrl
            })
            .returning();

        // Run multiple tests based on count
        for (let i = 0; i < validatedData.count; i++) {
            const startTime = performance.now();
            let firstTokenTime = 0;
            let content = '';

            const res = await client.chat.completions.create({
                messages: [{
                    role: 'user',
                    content: selectedSuite.prompts[i]
                }],
                model: validatedData.modelId,
            });

            if (content.length === 0) {
                firstTokenTime = performance.now() - startTime;
            }

            content = res.choices[0].message.content || '';
            const totalTokens = estimateTokens(content);
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const outputTime = totalTime - firstTokenTime;

            const result = {
                prompt: selectedSuite.prompts[i],
                model: validatedData.modelId,
                firstTokenLatency: firstTokenTime,
                tokensPerSecond: (totalTokens / outputTime) * 1000,
                tokensPerSecondTotal: (totalTokens / totalTime) * 1000,
                outputToken: totalTokens,
                totalTime,
                outputTime,
                content
            };

            results.push(result);

            // Store individual test result
            await db.insert(speedTestResultsTable)
                .values({
                    speedTestId: speedTest.id,
                    ...result
                });
        }

        done(null, {
            speedTestId: speedTest.id,
            results,
            testSuite: {
                id: selectedSuite.id,
                name: selectedSuite.name,
                description: selectedSuite.description
            }
        });

    } catch (error) {
        console.error('Error processing job:', error);
        done(error as Error);
    }
});