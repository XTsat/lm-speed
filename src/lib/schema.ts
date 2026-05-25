import { z } from 'zod';

export const speedTestSchema = z.object({
  baseUrl: z.string().url('Please enter a valid URL'),
  apiKey: z.string().min(1, 'API Key is required'),
  modelId: z.string().min(1, 'Model ID is required'),
  // 测试次数，必须为正整数且不超过 100 次
  count: z.number()
    .int('Count must be an integer')
    .positive('Count must be a positive number')
    .max(20, 'Maximum count is 100')
    .optional(),
});

export const modelSchema = z.object({
  baseUrl: z.string().url('Please enter a valid URL'),
  apiKey: z.string().min(1, 'API Key is required'),
});

export type SpeedTestInput = z.infer<typeof speedTestSchema>;
