import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { WorkoutService } from './workout.service';
import { catchAsync } from '../../utils/catchAsync';
import { AppError } from '../../utils/appError';
import logger from '../../utils/logger';

const workoutService = new WorkoutService();

const generatePlanSchema = z.object({
    splitType: z.enum(['ppl', 'upper_lower', 'full_body', 'bro_split']),
    equipmentIds: z.array(z.string()),
});

export class WorkoutController {
    generatePlan = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        const { splitType, equipmentIds } = generatePlanSchema.parse(req.body);

        logger.info(`Generating workout plan for user ${userId} with split ${splitType}`);

        const plan = await workoutService.generatePlan(userId, splitType, equipmentIds);

        res.status(201).json({
            status: 'success',
            data: { plan },
        });
    });

    getCurrentPlan = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        const plan = await workoutService.getCurrentPlan(userId);

        if (!plan) {
            return res.status(200).json({ status: 'success', data: { plan: null } });
        }

        res.status(200).json({
            status: 'success',
            data: { plan }
        });
    });

    markExerciseComplete = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        // Validate body
        await workoutService.markExerciseComplete(userId, req.body);

        res.status(200).json({ status: 'success' });
    });

    getWeeklyProgress = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        const { start, end } = req.query as { start: string, end: string };

        if (!start || !end) return next(new AppError('Please provide start and end dates', 400));

        const progress = await workoutService.getWeeklyProgress(userId, start, end);

        res.status(200).json({ status: 'success', data: { progress } });
    });
}
