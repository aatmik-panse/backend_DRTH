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
      Identify ALL gym equipment visible in this image.
      
      STRICTLY match the identified equipment to one of the following Standardized Equipment Names if possible. 
      If a direct match exists, use the Exact Name from the list below.
      
      ${STANDARD_EQUIPMENT_LIST}
      
      If the equipment is NOT in the list, provide a descriptive name.

      Return a JSON object with a key "equipment", containing an array of OBJECTS.
      Each object MUST be a standard JSON object.
      
      Structure:
      {
        "equipment": [
          { "name": "Leg Press", "category": "machines", "confidence": 0.98 },
          { "name": "Dumbbells", "category": "free_weights", "confidence": 0.95 }
        ]
      }

      CRITICAL INSTRUCTIONS:
      1. Do NOT return a flat list like ["name", "Leg Press"...].
      2. Do NOT return numbers like 123 or -1.1.
      3. Do NOT return strings as items.
      4. ONLY return an array of OBJECTS.
      5. Do NOT return an "icon" field.
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
