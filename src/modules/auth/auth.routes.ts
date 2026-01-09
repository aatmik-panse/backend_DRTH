// Auth Routes
import express from 'express';
import { AuthController } from './auth.controller';
import { protect } from '../../middleware/auth.middleware';

const router = express.Router();
const authController = new AuthController();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', protect, authController.getMe);

export default router;
