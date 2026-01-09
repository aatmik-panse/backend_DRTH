import express from 'express';
import { GymController } from './gym.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();
const gymController = new GymController();

router.get('/nearby', protect, gymController.getNearbyGyms);
router.get('/:id', protect, gymController.getGym);

export default router;
