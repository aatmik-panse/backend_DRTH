import { Request, Response, NextFunction } from 'express';
// z import removed as it is now in dto
import { UserService } from './user.service';
import { catchAsync } from '../../utils/catchAsync';
import { AppError } from '../../utils/appError';
import logger from '../../utils/logger';

const userService = new UserService();

import { userProfileSchema, UserProfileInput } from './user.dto';

export class UserController {
    getProfile = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        const user = await userService.getProfile(userId);

        if (!user) {
            return next(new AppError('User not found', 404));
        }

        res.status(200).json({
            status: 'success',
            data: { user },
        });
    });

    updateProfile = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        const data = userProfileSchema.parse(req.body);

        logger.info(`Updating profile for user: ${userId}`);

        const updatedUser = await userService.updateProfile(userId, data);

        res.status(200).json({
            status: 'success',
            data: { user: updatedUser },
        });
    });
}
