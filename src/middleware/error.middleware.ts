import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';
import logger from '../utils/logger';

export const globalErrorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    logger.error(
        `${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`
    );

    if (err.stack) {
        logger.error(err.stack);
    }

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
};
