import prisma from "../../config/prisma";
import { Gym } from '../../generated/prisma';

export class GymService {
    async getNearbyGyms(lat: number, lng: number, radiusInMeters: number) {
        // Basic implementation: Fetch all gyms and filter by distance.
        // Optimization for production: Use PostGIS or bounding box query.
        const allGyms = await prisma.gym.findMany();

        return allGyms.filter((gym: Gym) => {
            const distance = this.calculateDistance(lat, lng, gym.latitude, gym.longitude);
            // store distance in the object to return it? Prisma types might resist. 
            // We can map it to a new object.
            return distance <= radiusInMeters;
        }).map((gym: Gym) => ({
            ...gym,
            distance: this.calculateDistance(lat, lng, gym.latitude, gym.longitude)
        })).sort((a: any, b: any) => a.distance - b.distance);
    }

    async getGym(id: string) {
        return prisma.gym.findUnique({
            where: { id },
            include: {
                userEquipment: true
            }
        });
    }

    // Haversine formula
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
}
