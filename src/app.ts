import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';
import equipmentRoutes from './modules/equipment/equipment.routes';
import gymRoutes from './modules/gym/gym.routes';
import workoutRoutes from './modules/workout/workout.routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/gyms', gymRoutes);
app.use('/api/workout-plans', workoutRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: `Can't find ${req.originalUrl} on this server!`,
    });
});

export default app;
