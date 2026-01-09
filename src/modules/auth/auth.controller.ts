import { Request, Response, NextFunction } from 'express';

import { AuthService } from './auth.service';
import { catchAsync } from '../../utils/catchAsync';
import { registerSchema, loginSchema } from './auth.dto';

const authService = new AuthService();

export class AuthController {
    register = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const data = registerSchema.parse(req.body);
        const result = await authService.register(data);

        res.status(201).json({
            status: 'success',
            data: result,
        });
    });

    login = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const data = loginSchema.parse(req.body);
        const result = await authService.login(data);

        res.status(200).json({
            status: 'success',
            data: result,
        });
    });

    getMe = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        // req.user is set by auth middleware
        const user = (req as any).user;

        res.status(200).json({
            status: 'success',
            data: { user },
        });
    });
}
