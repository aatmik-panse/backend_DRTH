// index.ts
import 'dotenv/config'
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

// Prisma 7 with Postgres Adapter
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("Testing Prisma with new Workout Schema...");

    // 1. Create a Gym
    const gym = await prisma.gym.create({
        data: {
            name: "Elite Fitness",
            address: "123 Strength St, Power City",
            latitude: 40.7128,
            longitude: -74.0060,
        }
    });
    console.log("Gym created:", gym.name);

    // 2. Create a User
    const user = await prisma.user.create({
        data: {
            email: `test_user_${Date.now()}@example.com`,
            password: "hashed_password_here",
            name: "John Doe",
            selectedGymId: gym.id,
            experienceLevel: "intermediate",
            fitnessGoal: "muscle_gain"
        }
    });
    console.log("User created:", user.email);

    // 3. Create Equipment
    const equipment = await prisma.equipment.create({
        data: {
            name: "Dumbbells",
            category: "free_weights"
        }
    });
    console.log("Equipment created:", equipment.name);

    // 4. Link User to Equipment
    const userEquipment = await prisma.userEquipment.create({
        data: {
            userId: user.id,
            equipmentId: equipment.id,
            gymId: gym.id
        }
    });
    console.log("User linked to equipment.");

    // 5. Query data back
    const userData = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
            selectedGym: true,
            userEquipment: {
                include: {
                    equipment: true
                }
            }
        }
    });

    console.log("\nQuery Result:");
    console.log(`User: ${userData?.name}`);
    console.log(`Gym: ${userData?.selectedGym?.name}`);
    console.log(`Equipment: ${userData?.userEquipment[0]?.equipment.name}`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
