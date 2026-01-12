import prisma from "../../config/prisma";
import { AppError } from '../../utils/appError';
import { Equipment, User, Exercise } from '../../generated/prisma';

export class WorkoutService {
    async generatePlan(userId: string, splitType: string, equipmentIds: string[]) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError('User not found', 404);

        // 1. Get available exercises based on equipment
        // Ideally we filter exercises that require equipment in the list.
        // For simplicity, we assume we fetch all and check if their required equipment is in equipmentIds.
        // Note: Exercise-Equipment relation is Many-to-Many.

        // Efficient way: Find all exercises where required equipment is in `equipmentIds` OR equipment is "bodyweight".
        // This is complex with just Prisma calls on standard schema if "required" logic isn't strict.
        // We will fetch all exercises and filter in memory for this MVP logic.
        const allExercises = await prisma.exercise.findMany({
            include: { exerciseEquipment: true }
        });

        const availableExercises = allExercises.filter(ex => {
            // If no equipment required (bodyweight) or all primary equipment is in user's list
            const required = ex.exerciseEquipment.filter(eq => eq.isPrimary);
            if (required.length === 0) return true; // Bodyweight

            // Check if at least ONE of the variations/options is available? 
            // Or if the exercise needs ALL listed equipment?
            // Usually it's "Requires Dumbbells" -> Check if user has Dumbbells.
            // Let's assume strict check: All primary equipment for this exercise must be present.
            return required.every(req => equipmentIds.includes(req.equipmentId));
        });

        // 2. Define Split Structure
        const days = this.getSplitDays(splitType);

        // 3. Create Plan
        const plan = await prisma.workoutPlan.create({
            data: {
                userId,
                splitType,
                days: {
                    create: days.map(day => ({
                        dayNumber: day.dayNumber,
                        dayName: day.dayName,
                        focus: day.focus,
                        isRestDay: day.isRestDay
                    }))
                }
            },
            include: { days: true }
        });

        // 4. Fill Days with Exercises
        for (const day of plan.days) {
            if (day.isRestDay) continue;

            const muscleGroups = day.focus ? day.focus.split(',').map(s => s.trim()) : [];
            const dayExercises: any[] = [];

            for (const group of muscleGroups) {
                // Select exercises for this muscle group
                const groupExercises = availableExercises.filter(ex =>
                    ex.muscleGroup.toLowerCase().includes(group.toLowerCase())
                );

                // Pick 2-3 random exercises for variety
                const selected = this.sampleSize(groupExercises, 3);
                dayExercises.push(...selected);
            }

            // Save exercises to DB
            let orderIndex = 0;
            for (const ex of dayExercises) {
                const { sets, reps } = this.getVolume(user.fitnessGoal || 'general');

                await prisma.planExercise.create({
                    data: {
                        planDayId: day.id,
                        exerciseId: ex.id,
                        orderIndex: orderIndex++,
                        sets,
                        reps
                    }
                });
            }
        }

        return prisma.workoutPlan.findUnique({
            where: { id: plan.id },
            include: {
                days: {
                    include: { exercises: { include: { exercise: true } } }
                }
            }
        });
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

    private getSplitDays(splitType: string) {
        // PPL Structure
        if (splitType === 'ppl') {
            return [
                { dayNumber: 1, dayName: 'Push', focus: 'Chest, Shoulders, Triceps', isRestDay: false },
                { dayNumber: 2, dayName: 'Pull', focus: 'Back, Biceps, Traps', isRestDay: false },
                { dayNumber: 3, dayName: 'Legs', focus: 'Legs, Quads, Hamstrings, Glutes, Calves', isRestDay: false },
                { dayNumber: 4, dayName: 'Rest', focus: 'Rest', isRestDay: true },
                { dayNumber: 5, dayName: 'Push', focus: 'Chest, Shoulders, Triceps', isRestDay: false },
                { dayNumber: 6, dayName: 'Pull', focus: 'Back, Biceps, Traps', isRestDay: false },
                { dayNumber: 7, dayName: 'Rest', focus: 'Rest', isRestDay: true },
            ];
        }
        // Default to Full Body if unknown
        return [
            { dayNumber: 1, dayName: 'Full Body A', focus: 'Chest, Back, Legs, Shoulders', isRestDay: false },
            { dayNumber: 2, dayName: 'Rest', focus: 'Rest', isRestDay: true },
            { dayNumber: 3, dayName: 'Full Body B', focus: 'Legs, Back, Chest, Arms', isRestDay: false },
            { dayNumber: 4, dayName: 'Rest', focus: 'Rest', isRestDay: true },
            { dayNumber: 5, dayName: 'Full Body C', focus: 'Glutes, Shoulders, Back, Core', isRestDay: false },
            { dayNumber: 6, dayName: 'Rest', focus: 'Rest', isRestDay: true },
            { dayNumber: 7, dayName: 'Rest', focus: 'Rest', isRestDay: true },
        ];
    }

    private getVolume(goal: string) {
        if (goal === 'strength') return { sets: 5, reps: '5' };
        if (goal === 'muscle_gain') return { sets: 3, reps: '8-12' };
        if (goal === 'fat_loss') return { sets: 3, reps: '12-15' };
        return { sets: 3, reps: '10' };
    }

    private sampleSize(array: any[], n: number) {
        const shuffled = array.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, n);
    }

    async markExerciseComplete(userId: string, data: any) {
        const { planId, exerciseId, dayIndex, weekNumber, date, completed } = data;

        // Check if entry exists
        const existing = await prisma.workoutProgress.findUnique({
            where: {
                userId_exerciseId_workoutDate: {
                    userId,
                    exerciseId,
                    workoutDate: new Date(date) // ensure date object
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
