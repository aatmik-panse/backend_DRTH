import prisma from "../../config/prisma";
import { AppError } from '../../utils/appError';
import { GoogleGenAI } from "@google/genai";
import { env } from '../../config/env';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || '' });

// Schema for AI-generated exercises
const exerciseSchema = z.object({
    name: z.string(),
    muscleGroup: z.string(),
    sets: z.number(),
    reps: z.string(),
    notes: z.string().optional()
});

const dayPlanSchema = z.object({
    dayNumber: z.number(),
    dayName: z.string(),
    focus: z.string(),
    isRestDay: z.boolean(),
    exercises: z.array(exerciseSchema)
});

const workoutPlanSchema = z.object({
    days: z.array(dayPlanSchema)
});

export class WorkoutService {
    async generatePlan(userId: string, splitType: string, equipmentNames: string[]) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError('User not found', 404);

        console.log(`Generating workout plan for user ${userId}`);
        console.log(`Split: ${splitType}, Equipment: ${equipmentNames.join(', ')}`);

        // Use the reliable fallback plan directly instead of AI
        // AI integration was returning garbage data (200+ days instead of 7)
        const aiPlan = this.getFallbackPlan(splitType, user.fitnessGoal || 'muscle_gain');

        // Create the plan in database
        const plan = await prisma.workoutPlan.create({
            data: {
                userId,
                splitType,
                isActive: true
            }
        });

        // Create days and exercises
        const createdDays = [];

        // Log raw AI response for debugging
        console.log('Raw AI plan days count:', aiPlan?.days?.length);
        console.log('AI plan structure:', JSON.stringify(aiPlan, null, 2));

        // Validate AI response
        if (!aiPlan || !aiPlan.days || !Array.isArray(aiPlan.days)) {
            console.error('Invalid AI plan structure:', aiPlan);
            throw new AppError('AI generated invalid plan structure', 500);
        }

        for (let i = 0; i < aiPlan.days.length; i++) {
            const dayData = aiPlan.days[i];

            // Skip null entries but be lenient with validation
            if (!dayData) {
                console.warn(`Skipping null day entry at index ${i}`);
                continue;
            }

            // Accept dayNumber as number or string, default to index+1
            const dayNumber = typeof dayData.dayNumber === 'number'
                ? dayData.dayNumber
                : (parseInt(dayData.dayNumber) || (i + 1));

            const day = await prisma.planDay.create({
                data: {
                    planId: plan.id,
                    dayNumber: dayNumber,
                    dayName: dayData.dayName || `Day ${dayNumber}`,
                    focus: dayData.focus || '',
                    isRestDay: dayData.isRestDay === true || Boolean(dayData.isRestDay)
                }
            });

            // Format exercises for response - handle null/undefined exercises
            const exercises = Array.isArray(dayData.exercises) ? dayData.exercises : [];
            const exercisesForDay = exercises
                .filter((ex: any) => ex && ex.name) // Filter out invalid entries
                .map((ex: any, index: number) => ({
                    id: `${day.id}-ex-${index}`,
                    name: ex.name,
                    muscleGroup: ex.muscleGroup || '',
                    sets: ex.sets || 3,
                    reps: ex.reps || '10',
                    notes: ex.notes || '',
                    orderIndex: index
                }));

            createdDays.push({
                id: day.id,
                planId: plan.id,
                dayNumber: day.dayNumber,
                dayName: day.dayName,
                focus: day.focus,
                isRestDay: day.isRestDay,
                createdAt: day.createdAt,
                exercises: exercisesForDay
            });
        }

        return {
            id: plan.id,
            userId: plan.userId,
            splitType: plan.splitType,
            isActive: plan.isActive,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
            days: createdDays
        };
    }

    private async generateExercisesWithAI(
        splitType: string,
        equipmentNames: string[],
        fitnessGoal: string,
        experienceLevel: string
    ) {
        const jsonSchema = zodToJsonSchema(workoutPlanSchema as any);
        if (jsonSchema && typeof jsonSchema === 'object' && '$schema' in jsonSchema) {
            delete (jsonSchema as any).$schema;
        }

        const splitDescription = this.getSplitDescription(splitType);
        const volumeGuidance = this.getVolumeGuidance(fitnessGoal);

        const prompt = `
You are a professional fitness coach. Generate a complete weekly workout plan.

USER PROFILE:
- Fitness Goal: ${fitnessGoal}
- Experience Level: ${experienceLevel}
- Available Equipment: ${equipmentNames.length > 0 ? equipmentNames.join(', ') : 'Bodyweight only'}

WORKOUT SPLIT: ${splitType}
${splitDescription}

VOLUME GUIDANCE:
${volumeGuidance}

INSTRUCTIONS:
1. Create a 7-day workout plan following the ${splitType} split
2. For each non-rest day, include 4-6 exercises targeting the specified muscle groups
3. ONLY use exercises that can be performed with the available equipment
4. If no equipment is available, use bodyweight exercises only
5. Include sets and reps appropriate for the user's fitness goal
6. Add brief notes for form tips or variations when helpful

Return a JSON object with this exact structure:
{
  "days": [
    {
      "dayNumber": 1,
      "dayName": "Push",
      "focus": "Chest, Shoulders, Triceps",
      "isRestDay": false,
      "exercises": [
        {
          "name": "Bench Press",
          "muscleGroup": "Chest",
          "sets": 4,
          "reps": "8-10",
          "notes": "Control the negative"
        }
      ]
    }
  ]
}
`;

        try {
            console.log('Sending workout plan request to Gemini...');
            const startTime = Date.now();

            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: jsonSchema as any,
                },
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }]
                    }
                ]
            });

            console.log(`Gemini response received in ${Date.now() - startTime}ms`);

            const textResponse = response.text || "";
            let parsedData: any;

            try {
                parsedData = JSON.parse(textResponse);
            } catch (e) {
                const match = textResponse.match(/```json\n([\s\S]*?)\n```/);
                if (match) {
                    parsedData = JSON.parse(match[1]);
                } else {
                    throw new Error('Failed to parse AI response');
                }
            }

            console.log(`Generated plan with ${parsedData.days?.length || 0} days`);
            return parsedData;

        } catch (error) {
            console.error('AI workout generation failed:', error);
            // Fallback to a basic template
            return this.getFallbackPlan(splitType, fitnessGoal);
        }
    }

    private getSplitDescription(splitType: string): string {
        switch (splitType) {
            case 'ppl':
                return `
Push/Pull/Legs (PPL) - 6 training days:
- Day 1: Push (Chest, Shoulders, Triceps)
- Day 2: Pull (Back, Biceps, Rear Delts)
- Day 3: Legs (Quads, Hamstrings, Glutes, Calves)
- Day 4: Rest
- Day 5: Push (Chest, Shoulders, Triceps)
- Day 6: Pull (Back, Biceps, Rear Delts)
- Day 7: Rest`;
            case 'upper_lower':
                return `
Upper/Lower Split - 4 training days:
- Day 1: Upper Body (Chest, Back, Shoulders, Arms)
- Day 2: Lower Body (Quads, Hamstrings, Glutes, Calves)
- Day 3: Rest
- Day 4: Upper Body (Chest, Back, Shoulders, Arms)
- Day 5: Lower Body (Quads, Hamstrings, Glutes, Calves)
- Day 6: Rest
- Day 7: Rest`;
            case 'full_body':
                return `
Full Body - 3 training days:
- Day 1: Full Body A (All major muscle groups)
- Day 2: Rest
- Day 3: Full Body B (All major muscle groups)
- Day 4: Rest
- Day 5: Full Body C (All major muscle groups)
- Day 6: Rest
- Day 7: Rest`;
            default:
                return `${splitType} split`;
        }
    }

    private getVolumeGuidance(goal: string): string {
        switch (goal) {
            case 'strength':
                return 'Focus on compound movements. Sets: 4-5, Reps: 3-6, Rest: 3-5 min';
            case 'muscle_gain':
                return 'Moderate volume for hypertrophy. Sets: 3-4, Reps: 8-12, Rest: 60-90 sec';
            case 'fat_loss':
                return 'Higher reps, shorter rest. Sets: 3-4, Reps: 12-15, Rest: 30-60 sec';
            default:
                return 'Balanced approach. Sets: 3, Reps: 10-12';
        }
    }

    private getFallbackPlan(splitType: string, goal: string) {
        const { sets, reps } = this.getVolume(goal);

        if (splitType === 'ppl') {
            return {
                days: [
                    {
                        dayNumber: 1, dayName: 'Push', focus: 'Chest, Shoulders, Triceps', isRestDay: false,
                        exercises: [
                            { name: 'Push-ups', muscleGroup: 'Chest', sets, reps, notes: 'Keep core tight' },
                            { name: 'Pike Push-ups', muscleGroup: 'Shoulders', sets, reps, notes: 'For shoulder focus' },
                            { name: 'Diamond Push-ups', muscleGroup: 'Triceps', sets, reps, notes: 'Hands close together' },
                            { name: 'Dips', muscleGroup: 'Chest, Triceps', sets, reps, notes: 'Use chair or bench' }
                        ]
                    },
                    {
                        dayNumber: 2, dayName: 'Pull', focus: 'Back, Biceps', isRestDay: false,
                        exercises: [
                            { name: 'Pull-ups', muscleGroup: 'Back', sets, reps, notes: 'Full range of motion' },
                            { name: 'Inverted Rows', muscleGroup: 'Back', sets, reps, notes: 'Use table or bar' },
                            { name: 'Chin-ups', muscleGroup: 'Biceps', sets, reps, notes: 'Underhand grip' },
                            { name: 'Superman Hold', muscleGroup: 'Lower Back', sets, reps: '30 sec', notes: 'Hold position' }
                        ]
                    },
                    {
                        dayNumber: 3, dayName: 'Legs', focus: 'Quads, Hamstrings, Glutes', isRestDay: false,
                        exercises: [
                            { name: 'Squats', muscleGroup: 'Quads, Glutes', sets, reps, notes: 'Depth is key' },
                            { name: 'Lunges', muscleGroup: 'Quads, Glutes', sets, reps, notes: 'Alternate legs' },
                            { name: 'Romanian Deadlift', muscleGroup: 'Hamstrings', sets, reps, notes: 'Bodyweight or loaded' },
                            { name: 'Calf Raises', muscleGroup: 'Calves', sets, reps, notes: 'Full stretch at bottom' }
                        ]
                    },
                    { dayNumber: 4, dayName: 'Rest', focus: 'Recovery', isRestDay: true, exercises: [] },
                    {
                        dayNumber: 5, dayName: 'Push', focus: 'Chest, Shoulders, Triceps', isRestDay: false,
                        exercises: [
                            { name: 'Incline Push-ups', muscleGroup: 'Upper Chest', sets, reps, notes: 'Hands elevated' },
                            { name: 'Shoulder Taps', muscleGroup: 'Shoulders, Core', sets, reps, notes: 'Plank position' },
                            { name: 'Close-grip Push-ups', muscleGroup: 'Triceps', sets, reps, notes: 'Elbows close to body' },
                            { name: 'Handstand Hold', muscleGroup: 'Shoulders', sets, reps: '20-30 sec', notes: 'Against wall' }
                        ]
                    },
                    {
                        dayNumber: 6, dayName: 'Pull', focus: 'Back, Biceps', isRestDay: false,
                        exercises: [
                            { name: 'Wide Pull-ups', muscleGroup: 'Lats', sets, reps, notes: 'Wide grip' },
                            { name: 'Face Pulls (Band)', muscleGroup: 'Rear Delts', sets, reps, notes: 'If band available' },
                            { name: 'Negative Pull-ups', muscleGroup: 'Back', sets, reps: '5 sec down', notes: 'Slow eccentric' },
                            { name: 'Reverse Plank', muscleGroup: 'Posterior Chain', sets, reps: '30 sec', notes: 'Hold position' }
                        ]
                    },
                    { dayNumber: 7, dayName: 'Rest', focus: 'Recovery', isRestDay: true, exercises: [] }
                ]
            };
        }

        // Default full body fallback
        return {
            days: [
                {
                    dayNumber: 1, dayName: 'Full Body A', focus: 'All Muscle Groups', isRestDay: false,
                    exercises: [
                        { name: 'Push-ups', muscleGroup: 'Chest', sets, reps },
                        { name: 'Squats', muscleGroup: 'Legs', sets, reps },
                        { name: 'Pull-ups', muscleGroup: 'Back', sets, reps },
                        { name: 'Plank', muscleGroup: 'Core', sets, reps: '45 sec' }
                    ]
                },
                { dayNumber: 2, dayName: 'Rest', focus: 'Recovery', isRestDay: true, exercises: [] },
                {
                    dayNumber: 3, dayName: 'Full Body B', focus: 'All Muscle Groups', isRestDay: false,
                    exercises: [
                        { name: 'Dips', muscleGroup: 'Chest, Triceps', sets, reps },
                        { name: 'Lunges', muscleGroup: 'Legs', sets, reps },
                        { name: 'Inverted Rows', muscleGroup: 'Back', sets, reps },
                        { name: 'Mountain Climbers', muscleGroup: 'Core, Cardio', sets, reps: '30 sec' }
                    ]
                },
                { dayNumber: 4, dayName: 'Rest', focus: 'Recovery', isRestDay: true, exercises: [] },
                {
                    dayNumber: 5, dayName: 'Full Body C', focus: 'All Muscle Groups', isRestDay: false,
                    exercises: [
                        { name: 'Pike Push-ups', muscleGroup: 'Shoulders', sets, reps },
                        { name: 'Bulgarian Split Squats', muscleGroup: 'Legs', sets, reps },
                        { name: 'Chin-ups', muscleGroup: 'Back, Biceps', sets, reps },
                        { name: 'Dead Bug', muscleGroup: 'Core', sets, reps }
                    ]
                },
                { dayNumber: 6, dayName: 'Rest', focus: 'Recovery', isRestDay: true, exercises: [] },
                { dayNumber: 7, dayName: 'Rest', focus: 'Recovery', isRestDay: true, exercises: [] }
            ]
        };
    }

    private getVolume(goal: string) {
        if (goal === 'strength') return { sets: 5, reps: '5' };
        if (goal === 'muscle_gain') return { sets: 3, reps: '8-12' };
        if (goal === 'fat_loss') return { sets: 3, reps: '12-15' };
        return { sets: 3, reps: '10' };
    }

    async getCurrentPlan(userId: string) {
        return prisma.workoutPlan.findFirst({
            where: { userId, isActive: true },
            include: {
                days: {
                    include: { exercises: { include: { exercise: true } } }
                }
            }
        });
    }

    async markExerciseComplete(userId: string, data: any) {
        const { planId, exerciseId, dayIndex, weekNumber, date, completed } = data;

        const existing = await prisma.workoutProgress.findUnique({
            where: {
                userId_exerciseId_workoutDate: {
                    userId,
                    exerciseId,
                    workoutDate: new Date(date)
                }
            }
        });

        if (existing) {
            return prisma.workoutProgress.update({
                where: { id: existing.id },
                data: { completed, completedAt: completed ? new Date() : null }
            });
        }

        return prisma.workoutProgress.create({
            data: {
                userId,
                planId,
                exerciseId,
                workoutDate: new Date(date),
                dayIndex,
                weekNumber,
                completed,
                completedAt: completed ? new Date() : null
            }
        });
    }

    async getWeeklyProgress(userId: string, startOfWeek: string, endOfWeek: string) {
        return prisma.workoutProgress.findMany({
            where: {
                userId,
                workoutDate: {
                    gte: new Date(startOfWeek),
                    lte: new Date(endOfWeek)
                }
            }
        });
    }
}
