import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string(),
    JWT_SECRET: z.string().min(1),
    JWT_EXPIRES_IN: z.string().default('7d'),
    GEMINI_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
