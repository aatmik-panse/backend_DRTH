import express from 'express';
import { EquipmentController } from './equipment.controller';
import { protect } from '../../middleware/auth.middleware';
import { upload } from '../../config/multer';

const router = express.Router();
const equipmentController = new EquipmentController();

router.get('/', equipmentController.getAllEquipment);
router.post('/scan', protect, upload.single('image'), equipmentController.scanEquipment);

router.get('/user', protect, equipmentController.getUserEquipment);
router.post('/user', protect, equipmentController.addUserEquipment);

export default router;
