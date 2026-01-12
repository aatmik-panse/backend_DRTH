import { Request, Response, NextFunction } from 'express';
import { EquipmentService } from './equipment.service';
import { catchAsync } from '../../utils/catchAsync';
import { AppError } from '../../utils/appError';
import { z } from 'zod';
import logger from '../../utils/logger';

const equipmentService = new EquipmentService();

const addEquipmentSchema = z.object({
    equipmentIds: z.array(z.string()),
});

export class EquipmentController {
    getAllEquipment = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const equipment = await equipmentService.getAllEquipment();
        res.status(200).json({
            status: 'success',
            data: { equipment },
        });
    });

    scanEquipment = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        if (!req.file) {
            return next(new AppError('No image uploaded', 400));
        }

        logger.info(`Scanning equipment image... Size: ${req.file.size} bytes, Mime: ${req.file.mimetype}`);

        const detected = await equipmentService.scanEquipment(req.file.buffer, req.file.mimetype);

        logger.info(`Scan completed in ${Date.now() - startTime}ms. Detected ${detected.length} items.`);

        res.status(200).json({
            status: 'success',
            data: { detectedEquipment: detected },
        });
    });

    addUserEquipment = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        const { equipmentIds } = addEquipmentSchema.parse(req.body);

        await equipmentService.addUserEquipment(userId, equipmentIds);

        res.status(200).json({
            status: 'success',
            message: 'Equipment added to profile',
        });
    });

    getUserEquipment = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user.id;
        const equipment = await equipmentService.getUserEquipment(userId);

        res.status(200).json({
            status: 'success',
            data: { equipment },
        });
    });
}
