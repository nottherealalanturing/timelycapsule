import './env.js';
import { createApp } from './app.js';
import { db } from './db/client.js';
import { logger } from './logger.js';

const port = Number(process.env.PORT ?? 4001);
const app = createApp(db);

app.listen(port, () => {
  logger.info(`api listening on :${port}`);
});
