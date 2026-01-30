import { GoogleGenAI } from "@google/genai";
import prisma from "../../config/prisma";
import { env } from '../../config/env';
import { AppError } from '../../utils/appError';

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Initialize Gemini with new SDK
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || '' });

const equipmentItemSchema = z.object({
    name: z.string(),
    category: z.string().default('machines'),
    confidence: z.number(),
    icon: z.string().optional(),
});

const equipmentResponseSchema = z.object({
    equipment: z.array(equipmentItemSchema)
});

// Standard Equipment List for AI Reference
const STANDARD_EQUIPMENT_LIST = `
- Free Weights: Barbell 🏋️‍♂️, Dumbbells 💪, Kettlebells 🔔, EZ Bar ➰, Bench Press 🪑, Incline Bench Press 📐, Decline Bench Press 📉, Squat Rack ⛩️, Power Rack 🏢, Smith Machine 🤖, Preacher Curl Bench 🙏
- Machines: Leg Press 🦵, Leg Extension 🦵, Leg Curl 🍤, Hack Squat 🏋️, Chest Press Machine 🚪, Shoulder Press Machine 🆙, Lat Pulldown ⬇️, Seated Cable Row 🚣, Pec Deck / Fly Machine 🦋, Assisted Pull-up Machine 🆘, Calf Raise Machine 👠, Abdominal Crunch Machine 🍫, Hip Abduction/Adduction ↔️
- Machines (Extended): Chest Fly Machine 🦅, Iso-Lateral Chest Press 👐, Incline Chest Press Machine 📐, Seated Leg Press 🪑, Standing Leg Curl 🧍, Lying Leg Curl 🛏️, Glute Kickback Machine 🍑, Hip Thrust Machine 🚀, Vertical Row Machine 🚣, Low Row Machine 🚣‍♀️, High Row Machine 🦅, Pullover Machine 🙆, Lateral Raise Machine 👐, Rear Delt Fly Machine 🔙, Bicep Curl Machine 💪, Tricep Extension Machine 💪, Tricep Dip Machine ⏬, Ab Coaster 🎢, Torso Rotation Machine 🔄, Seated Ab Crunch 🍫, Standing Calf Raise Machine 🕴️, Seated Calf Raise Machine 🪑, Smith Squat Machine 🤖, V-Squat Machine ✌️, Pendulum Squat Machine 🕰️, Selectorized Multi-Gym 🏗️
- Cable: Cable Crossover ❌, Functional Trainer 🏋️
- Cardio: Treadmill 🏃, Elliptical 🚶, Stationary Bike 🚴, Rowing Machine 🚣, Stair Climber 🪜, Assault Bike 💨, SkiErg ⛷️
- Bodyweight: Pull-up Bar 🆙, Dip Station ⏬, Parallel Bars ⏸️, Roman Chair / Back Extension 🏹, Plyometric Box 📦, TRX / Suspension Trainer 🎗️, Gymnastic Rings ⭕
- Other: Medicine Ball 🏐, Slam Ball 🌑, Battle Ropes 〰️, Landmine Attachment 💣, Trap Bar / Hex Bar 🛑
`;

export class EquipmentService {
    async getAllEquipment() {
        return prisma.equipment.findMany();
    }

    async scanEquipment(images: { buffer: Buffer, mimeType: string }[]) {
        if (!env.GEMINI_API_KEY) {
            throw new AppError('Gemini API Key not configured', 500);
        }

        const jsonSchema = zodToJsonSchema(equipmentResponseSchema as any);
        if (jsonSchema && typeof jsonSchema === 'object' && '$schema' in jsonSchema) {
            delete (jsonSchema as any).$schema;
        }

        const prompt = `
      Task: Identify all gym equipment in the provided images.
      
      Instructions:
      1. Provide a unique list of found items.
      2. For each item, use the most accurate name from this list if it matches:
      ${STANDARD_EQUIPMENT_LIST}
      3. If no match, provide a clear, descriptive name.
      4. CRITICAL: Never use a category name (e.g., 'machines', 'cardio') or a technical field name (e.g., 'confidence', 'name') as the equipment name itself.
      5. Consolidate items detected across multiple images into one single list without duplicates.

      Format Requirement:
      Return a JSON object with the key "equipment", which is an array of objects.
      Example structure:
      {
        "equipment": [
          { "name": "Leg Press", "category": "machines", "confidence": 0.99 },
          { "name": "Dumbbells", "category": "free_weights", "confidence": 0.95 }
        ]
      }
    `;

        const imageParts = images.map(img => ({
            inlineData: {
                data: img.buffer.toString('base64'),
                mimeType: img.mimeType,
            },
        }));

        let result: any;
        try {
            console.log(`Sending request to Gemini with ${images.length} images...`);
            const startGemini = Date.now();

            // Using stable model name and forcing JSON response
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: jsonSchema as any,
                },
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt },
                            ...imageParts
                        ]
                    }
                ]
            });

            console.log(`Gemini response received in ${Date.now() - startGemini}ms`);

            // New SDK returns data in response.text() usually, or we access .text() on the result
            const textResponse = response.text || "";
            // console.log('Gemini raw response:', textResponse);

            let parsedData: any;
            try {
                parsedData = JSON.parse(textResponse);
            } catch (e) {
                // Try to find JSON if wrapped in markdown code blocks
                const match = textResponse.match(/```json\n([\s\S]*?)\n```/);
                if (match) {
                    parsedData = JSON.parse(match[1]);
                } else {
                    parsedData = { equipment: [] }; // Fallback
                }
            }

            // Map response to internal structure
            let detectedItems: { id: string, name: string, category: string, confidence: number, icon?: string }[] = [];

            if (parsedData && parsedData.equipment && Array.isArray(parsedData.equipment)) {

                // 1. Filter out nulls first
                let rawList = parsedData.equipment.filter((i: any) => i !== null);

                // 2. Detect "Flat Array" or Mixed Garbage (e.g. contains strings like key names but also has non-object garbage)
                const isFlatArray = rawList.length > 0 &&
                    rawList.some((i: any) => typeof i === 'string' && ['name', 'category'].includes(i)) &&
                    rawList.some((i: any) => typeof i !== 'object');

                if (isFlatArray) {
                    const reconstructed = [];
                    let tempObj: any = {};

                    for (let i = 0; i < rawList.length; i++) {
                        const val = rawList[i];

                        // heuristic: skip random detected numbers that are likely vector garbage
                        if (typeof val === 'number' && val !== 0 && val !== 1 && (val > 1 || val < 0)) continue;

                        // Check for keys
                        if (val === 'name') {
                            if (tempObj.name) { reconstructed.push(tempObj); tempObj = {}; }
                            if (i + 1 < rawList.length) { tempObj.name = rawList[i + 1]; i++; }
                        } else if (val === 'category' && i + 1 < rawList.length) {
                            tempObj.category = rawList[i + 1]; i++;
                        } else if (val === 'confidence' && i + 1 < rawList.length) {
                            tempObj.confidence = rawList[i + 1]; i++;
                        }
                    }
                    if (tempObj.name) reconstructed.push(tempObj);

                    if (reconstructed.length > 0) rawList = reconstructed;
                }

                // Category Icon Mapping
                const getIconForCategory = (cat: string) => {
                    switch (cat) {
                        case 'free_weights': return '🏋️';
                        case 'machines': return '⚙️';
                        case 'cardio': return '🏃';
                        case 'cable': return '🔗';
                        case 'bodyweight': return '💪';
                        default: return '🏋️';
                    }
                };

                detectedItems = rawList.map((item: any) => {
                    // 3. Final Filter: Must be object or parsable string
                    if (typeof item === 'number') return null;
                    if (Array.isArray(item)) return null;

                    // Handle double-encoded JSON strings (e.g. "{\"name\": \"...\"}")
                    if (typeof item === 'string' && item.trim().startsWith('{')) {
                        try {
                            return JSON.parse(item);
                        } catch (e) {
                            return { name: item };
                        }
                    }
                    // Handle plain strings that survived (likely valid names but flat array logic missed them?)
                    if (typeof item === 'string') {
                        if (['name', 'category', 'icon'].includes(item)) return null; // Garbage key leftover
                        return { name: item, category: 'machines', confidence: 0.9 };
                    }
                    return item;
                })
                    .filter((item: any) => item !== null && typeof item === 'object') // 4. Remove nulls and non-objects
                    .map((item: any) => {
                        const category = item.category || 'machines';
                        return {
                            id: Math.random().toString(36).substr(2, 9),
                            name: item.name || 'Unknown Machine',
                            category: category,
                            confidence: item.confidence || 0.8,
                            icon: getIconForCategory(category)
                        };
                    });
            }

            return detectedItems;
        } catch (error) {
            console.error('Gemini API Error:', error);
            // new SDK error structure might differ, checking for response property if available
            if ((error as any).response) {
                try {
                    const errText = await (error as any).response.text();
                    console.error('Raw Response that failed validation:', errText);
                } catch (e2) { }
            }
            throw new AppError('Failed to analyze image', 500);
        }
    }

    async addUserEquipment(userId: string, equipmentIds: string[]) {
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
