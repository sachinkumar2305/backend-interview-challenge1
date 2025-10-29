import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Database } from './db/database';
import { createTaskRouter } from './routes/tasks';
import { createSyncRouter } from './routes/sync';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
const db = new Database(process.env.DATABASE_URL || './data/tasks.sqlite3');

// Basic test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

// Routes
app.use('/api/tasks', createTaskRouter(db));
app.use('/api', createSyncRouter(db));

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    timestamp: new Date()
  });
});

// Start server
async function start() {
  try {
    // Initialize database
    await db.initialize();
    console.log('Database initialized');
    
    // Start the server
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Handle server-specific errors
    server.on('error', (error: Error) => {
      console.error('Server error:', error);
    });

    // Global error handlers to prevent crashes
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      // Don't exit, just log the error
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      // Don't exit, just log the error
    });

    // Cleanup on shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Closing server gracefully...');
      await db.close();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    return server; // Return the server instance
  } catch (error) {
    console.error('Failed to start server:', error);
    throw error; // Let nodemon handle the restart
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await db.close();
  process.exit(0);
});