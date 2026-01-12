import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from "../../config/prisma";
import { env } from '../../config/env';
import { AppError } from '../../utils/appError';
import { LoginInput, RegisterInput } from './auth.dto';

const signToken = (id: string) => {
    return jwt.sign({ id }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as any,
    });
};

import logger from '../../utils/logger';

export class AuthService {
    async register(data: RegisterInput) {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new AppError('Email already in use', 400);
        }

        const hashedPassword = await bcrypt.hash(data.password, 12);

        const user = await prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
                age: data.age,
            },
        });

        logger.info(`New user registered: ${user.email}`);

        const token = signToken(user.id);

        // Remove password from output
        const { password, ...userWithoutPassword } = user;

        return { user: userWithoutPassword, token };
    }

    async login(data: LoginInput) {
        const user = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (!user || !user.password || !(await bcrypt.compare(data.password, user.password))) {
            throw new AppError('Incorrect email or password', 401);
        }

        logger.info(`User logged in: ${data.email}`);

        const token = signToken(user.id);

        const { password, ...userWithoutPassword } = user;

        return { user: userWithoutPassword, token };
    }
}
