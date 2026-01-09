import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/appError';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || '');

export class EquipmentService {
    async getAllEquipment() {
        return prisma.equipment.findMany();
    }

    async scanEquipment(imageBuffer: Buffer, mimeType: string) {
        if (!env.GEMINI_API_KEY) {
            throw new AppError('Gemini API Key not configured', 500);
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
      Identify the gym equipment in this image. 
      Return a JSON array of objects, where each object has a "name" (string) and "confidence" (number between 0 and 1).
      Focus on standard gym equipment like: Bench Press, Squat Rack, Dumbbells, Treadmill, Leg Press, etc.
      Only return equipment with high confidence.
      Output pure JSON, no markdown.
    `;

        const imagePart = {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: mimeType,
            },
        };

        try {
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            let text = response.text();

            // Clean up markdown code blocks if present
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            const detectedItems = JSON.parse(text);
            return detectedItems;
        } catch (error) {
            console.error('Gemini API Error:', error);
            throw new AppError('Failed to analyze image', 500);
        }
    }

    async addUserEquipment(userId: string, equipmentIds: string[]) {
        // Basic implementation: add multiple equipment to user
        // This assumes equipmentIds exist in DB. 
        // Real implementation should probably first ensure equipment exists or allow creating new ones.
        // For now, let's link existing.

        // Deleting existing to overwrite or just upsert?
        // Requirement says "User confirms/edits detected equipment". 
        // Let's assume this is adding to their list.

        const operations = equipmentIds.map(eqId => {
            return prisma.userEquipment.upsert({
                where: {
                    userId_equipmentId: {
                        userId,
                        equipmentId: eqId
                    }
                },
                update: {},
                create: {
                    userId,
                    equipmentId: eqId
                }
            });
        });

        return prisma.$transaction(operations);
    }

    async getUserEquipment(userId: string) {
        return prisma.userEquipment.findMany({
            where: { userId },
            include: { equipment: true }
        });
    }
}
