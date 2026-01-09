import express from 'express';
import { UserController } from './user.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();
const userController = new UserController();

router.use(protect); // Protect all routes

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
// Alias for POST as per requirements, functionally acts as update or create additional info
router.post('/profile', userController.updateProfile);

export default router;
