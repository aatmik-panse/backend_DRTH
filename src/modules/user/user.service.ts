import { prisma } from '../../config/prisma';
import { UserProfileInput } from './user.dto';

export class UserService {
    async getProfile(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId },
            include: {
                selectedGym: true,
            },
        });
    }

    async updateProfile(userId: string, data: UserProfileInput) {
        return prisma.user.update({
            where: { id: userId },
            data,
        });
    }
}
