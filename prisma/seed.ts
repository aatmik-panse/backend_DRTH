import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

// @ts-ignore
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
} as any);

async function main() {
    console.log('Seeding database...');
    console.log('Database URL:', process.env.DATABASE_URL);

    // 1. Create Gyms
    const gym1 = await prisma.gym.create({
        data: {
            name: 'Gold\'s Gym Venice',
            address: '360 Hampton Dr, Venice, CA',
            latitude: 33.99,
            longitude: -118.47
        }
    });

    const gym2 = await prisma.gym.create({
        data: {
            name: 'Planet Fitness',
            address: '123 Main St',
            latitude: 34.05,
            longitude: -118.25
        }
    });

    // 2. Create Equipment
    const equipmentList = [
        { name: 'Barbell', category: 'free_weights' },
        { name: 'Dumbbells', category: 'free_weights' },
        { name: 'Bench Press', category: 'free_weights' },
        { name: 'Squat Rack', category: 'free_weights' },
        { name: 'Cable Machine', category: 'cable' },
        { name: 'Leg Press', category: 'machines' },
        { name: 'Treadmill', category: 'cardio' },
        { name: 'Pull-up Bar', category: 'bodyweight' }
    ];

    const equipments: any[] = [];
    for (const eq of equipmentList) {
        const created = await prisma.equipment.create({ data: eq });
        equipments.push(created);
    }

    // Helper to find eq by name
    const getEq = (name: string) => equipments.find(e => e.name === name)?.id;

    // 3. Create Exercises
    const exercises = [
        {
            name: 'Barbell Squat',
            muscleGroup: 'Legs, Quads, Glutes',
            category: 'compound',
            difficulty: 'intermediate',
            equipmentNames: ['Barbell', 'Squat Rack']
        },
        {
            name: 'Bench Press',
            muscleGroup: 'Chest, Triceps, Shoulders',
            category: 'compound',
            difficulty: 'intermediate',
            equipmentNames: ['Barbell', 'Bench Press']
        },
        {
            name: 'Dumbbell Curl',
            muscleGroup: 'Biceps',
            category: 'isolation',
            difficulty: 'beginner',
            equipmentNames: ['Dumbbells']
        },
        {
            name: 'Cable Fly',
            muscleGroup: 'Chest',
            category: 'isolation',
            difficulty: 'intermediate',
            equipmentNames: ['Cable Machine']
        },
        {
            name: 'Leg Press',
            muscleGroup: 'Legs, Quads',
            category: 'machine',
            difficulty: 'beginner',
            equipmentNames: ['Leg Press']
        },
        {
            name: 'Push-up',
            muscleGroup: 'Chest, Triceps',
            category: 'bodyweight',
            difficulty: 'beginner',
            equipmentNames: []
        }
    ];

    for (const ex of exercises) {
        const exercise = await prisma.exercise.create({
            data: {
                name: ex.name,
                muscleGroup: ex.muscleGroup,
                category: ex.category,
                difficulty: ex.difficulty
            }
        });

        // Link Equipment
        if (ex.equipmentNames.length > 0) {
            for (const eqName of ex.equipmentNames) {
                const eqId = getEq(eqName);
                if (eqId) {
                    await prisma.exerciseEquipment.create({
                        data: {
                            exerciseId: exercise.id,
                            equipmentId: eqId,
                            isPrimary: true
                        }
                    });
                }
            }
        }
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
