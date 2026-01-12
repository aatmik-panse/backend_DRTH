import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from "../../config/prisma";
import { env } from '../../config/env';
import { AppError } from '../../utils/appError';

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || '');

const equipmentItemSchema = z.object({
    name: z.string(),
    category: z.string().default('machines'),
    confidence: z.number(),
});

const equipmentResponseSchema = z.object({
    equipment: z.array(equipmentItemSchema)
});

export class EquipmentService {
    async getAllEquipment() {
        return prisma.equipment.findMany();
    }

    async scanEquipment(imageBuffer: Buffer, mimeType: string) {
        if (!env.GEMINI_API_KEY) {
            throw new AppError('Gemini API Key not configured', 500);
        }

        const jsonSchema = zodToJsonSchema(equipmentResponseSchema as any);
        if (jsonSchema && typeof jsonSchema === 'object' && '$schema' in jsonSchema) {
            delete (jsonSchema as any).$schema;
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: jsonSchema as any,
            },
        });

        const prompt = `
      Identify the gym equipment in this image. 
      Focus on standard gym equipment like: Bench Press, Squat Rack, Dumbbells, Treadmill, Leg Press, etc.
      Return a JSON object with a key "equipment", where each item is an object with fields:
      - "name": String name of the equipment
      - "category": String, strictly one of: "free_weights", "machines", "cable", "cardio", "bodyweight"
      - "confidence": Number between 0 and 1
      Only return equipment with high confidence.
    `;

        const imagePart = {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: mimeType,
            },
        };

        let result: any;
        try {
            console.log('Sending request to Gemini...');
            const startGemini = Date.now();
            result = await model.generateContent([prompt, imagePart]);
            const response = await result.response; // This awaits the full response
            console.log(`Gemini response received in ${Date.now() - startGemini}ms`);

            const textResponse = response.text();
            console.log('Gemini raw response:', textResponse);

            let parsedData: any;
            try {
                parsedData = JSON.parse(textResponse);
            } catch (e) {
                // Try to find JSON if wrapped in markdown code blocks
                const match = textResponse.match(/```json\n([\s\S]*?)\n```/);
                if (match) {
                    parsedData = JSON.parse(match[1]);
                } else {
                    throw e;
                }
            }

            // Robust parsing: Handle if it returns strings instead of objects
            let detectedItems: { name: string, category: string, confidence: number }[] = [];

            if (parsedData.equipment && Array.isArray(parsedData.equipment)) {
                detectedItems = parsedData.equipment.map((item: any) => {
                    if (typeof item === 'string') {
                        return { name: item, category: 'machines', confidence: 0.9 };
                    }
                    return {
                        name: item.name || 'Unknown',
                        category: item.category || 'machines',
                        confidence: item.confidence || 0.8
                    };
                });
            }

            return detectedItems;
        } catch (error) {
            console.error('Gemini API Error:', error);
            if (error instanceof z.ZodError) {
                console.error('Raw Response that failed validation:', (await result.response).text());
            }
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
