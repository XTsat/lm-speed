import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';

let db: ReturnType<typeof drizzle> | null = null;

if (process.env.DATABASE_URL) {
  try {
    db = drizzle(process.env.DATABASE_URL);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    db = null;
  }
}

export { db };
