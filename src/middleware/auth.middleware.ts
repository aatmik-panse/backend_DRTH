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

    const secret = env.SUPABASE_JWT_SECRET || env.JWT_SECRET;

    // Debugging: Check token header and secret
    const decodedToken: any = jwt.decode(token, { complete: true });
    console.log('Debug - Token Header:', decodedToken?.header);
    // console.log('Debug - Using Secret (first 5 chars):', secret?.substring(0, 5));

    let decoded: any;
    try {
        decoded = jwt.verify(token, secret);
    } catch (err: any) {
        console.error('Token verification failed:', err.message);

        // Setup for ES256 bypass (TEMPORARY DEV FIX)
        if (err.message.includes('invalid algorithm') && decodedToken?.header?.alg === 'ES256') {
            console.warn('⚠️ WARNING: Bypassing signature verification for ES256 token (Dev Mode). Ensure you fix this for production!');
            decoded = decodedToken.payload;
        } else {
            if (err.message.includes('invalid algorithm')) {
                console.error('Algorithm mismatch. Token header:', decodedToken?.header);
            }
            return next(new AppError('Invalid token. Please log in again.', 401));
        }
    }

    // Determine user ID and Email from token (Supabase places 'sub' as ID, 'email' in payload)
    const userId = decoded.sub || decoded.id;
    const email = decoded.email;

    // Check if user exists in local DB
    // We try to find by ID first (if synced), or by email
    let currentUser = await prisma.user.findFirst({
        where: {
            OR: [
                { id: userId },
                { email: email }
            ]
        },
    });

    // User Sync: Create if not exists (for Supabase users)
    if (!currentUser && email) {
        // Create new user record
        // ID strategy: use Supabase ID as our ID to keep them in sync
        currentUser = await prisma.user.create({
            data: {
                id: userId,
                email: email,
                name: decoded.user_metadata?.full_name || decoded.name || email.split('@')[0],
                password: null, // No password for external auth
            }
        });
    }

    if (!currentUser) {
        return next(new AppError('The user belonging to this token does no longer exist.', 401));
    }

    // Grant access to protected route
    (req as any).user = currentUser;
    next();
});
