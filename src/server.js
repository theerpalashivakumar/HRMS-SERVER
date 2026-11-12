import app from './app.js';
import config from './config/index.js';
import { connectDB } from './config/db.js';

connectDB()
  .then(() => app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`)))
  .catch((err) => { console.error('Failed to start server:', err.message); process.exit(1); });
