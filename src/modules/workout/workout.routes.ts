import express from 'express';
import { WorkoutController } from './workout.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();
const workoutController = new WorkoutController();

router.post('/generate', protect, workoutController.generatePlan);
router.get('/current', protect, workoutController.getCurrentPlan);

router.post('/progress', protect, workoutController.markExerciseComplete);
router.get('/progress/weekly', protect, workoutController.getWeeklyProgress);

export default router;
