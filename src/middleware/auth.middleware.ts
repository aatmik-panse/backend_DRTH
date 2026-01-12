import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/appError';
import { catchAsync } from '../utils/catchAsync';

export const protect = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string };

    const currentUser = await prisma.user.findUnique({
        where: { id: decoded.id },
    });

    if (!currentUser) {
        return next(new AppError('The user belonging to this token does no longer exist.', 401));
    }

    // Grant access to protected route
    (req as any).user = currentUser;
    next();
});
