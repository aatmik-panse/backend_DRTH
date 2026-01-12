import { env } from './config/env';
import app from './app';

const port = env.PORT;

const server = app.listen(port, () => {
    console.log(`App running on port ${port}...`);
});

process.on('unhandledRejection', (err: any) => {
    console.log('OoO OoO OoO UNHANDLED REJECTION! OoO OoO OoO');
    console.log(err.name, err.message);
    // server.close(() => {
    //     process.exit(1);
    // });
});
