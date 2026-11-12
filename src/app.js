import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/index.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();
app.use(helmet());

const isOriginAllowed = (origin) =>
  !origin || origin === config.clientUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(cors({
  origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);
export default app;
