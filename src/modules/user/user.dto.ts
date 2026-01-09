import { z } from 'zod';

export const userProfileSchema = z.object({
    age: z.number().optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
    unit: z.enum(['metric', 'imperial']).optional(),
    experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    fitnessGoal: z.enum(['muscle_gain', 'fat_loss', 'strength']).optional(),
    workoutDaysPerWeek: z.number().min(1).max(7).optional(),
    sessionDuration: z.number().optional(),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;
