import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { GymService } from './gym.service';
import { catchAsync } from '../../utils/catchAsync';
import { AppError } from '../../utils/appError';
import logger from '../../utils/logger';

const gymService = new GymService();

const nearbySchema = z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    radius: z.coerce.number().default(5000), // 5km default
});

const selectGymSchema = z.object({
    gymId: z.string(),
});


export class GymController {
    getNearbyGyms = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const { lat, lng, radius } = nearbySchema.parse(req.query);

        logger.info(`Fetching nearby gyms for lat: ${lat}, lng: ${lng}, radius: ${radius}`);

        const gyms = await gymService.getNearbyGyms(lat, lng, radius);

        res.status(200).json({
            status: 'success',
            data: { gyms },
        });
    });

    getGym = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const { id } = req.params as { id: string };
        const gym = await gymService.getGym(id);

        if (!gym) {
            return next(new AppError('Gym not found', 404));
        }

        res.status(200).json({
            status: 'success',
            data: { gym }
        });
    });
}
