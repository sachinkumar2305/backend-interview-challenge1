import { Router, Request, Response } from 'express';
import { SyncService } from '../services/syncService';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';
import { validateSyncBatch } from '../middleware/validation';

export function createSyncRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  // Trigger manual sync
  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const isOnline = await syncService.checkConnectivity();
      if (!isOnline) {
        return res.status(503).json({
          error: 'Service unavailable - offline mode',
          timestamp: new Date(),
          path: req.path
        });
      }

      const syncResult = await syncService.sync();
      res.json(syncResult);
    } catch (error) {
      res.status(500).json({
        error: 'Sync operation failed',
        timestamp: new Date(),
        path: req.path
      });
    }
  });

  // Check sync status
  router.get('/status', async (req: Request, res: Response) => {
    try {
      // Get pending sync queue items
      const pendingItems = await db.all(
        `SELECT COUNT(*) as count FROM sync_queue`
      );
      
      // Get latest sync timestamp
      const lastSyncData = await db.get(
        `SELECT MAX(last_synced_at) as last_sync FROM tasks WHERE last_synced_at IS NOT NULL`
      );

      const isOnline = await syncService.checkConnectivity();

      res.json({
        pending_sync_count: pendingItems[0].count,
        last_sync_timestamp: lastSyncData?.last_sync ? new Date(lastSyncData.last_sync) : null,
        is_online: isOnline,
        sync_queue_size: pendingItems[0].count
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get sync status',
        timestamp: new Date(),
        path: req.path
      });
    }
  });

  // Batch sync endpoint (for server-side)
  router.post('/batch', validateSyncBatch, async (req: Request, res: Response) => {
    try {
      const { items, client_timestamp } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          error: 'Invalid request body - items array is required',
          timestamp: new Date(),
          path: req.path
        });
      }

      // Process each item in the batch
      const processedItems = await Promise.all(items.map(async (item) => {
        try {
          let resolvedData;
          switch (item.operation) {
            case 'create':
              resolvedData = await taskService.createTask(item.data);
              break;
            case 'update':
              resolvedData = await taskService.updateTask(item.task_id, item.data);
              break;
            case 'delete':
              await taskService.deleteTask(item.task_id);
              resolvedData = { id: item.task_id, is_deleted: true };
              break;
          }

          return {
            client_id: item.task_id,
            server_id: resolvedData?.id || item.task_id,
            status: 'success',
            resolved_data: resolvedData
          };
        } catch (error) {
          return {
            client_id: item.task_id,
            server_id: item.task_id,
            status: 'error',
            error: (error as Error).message
          };
        }
      }));

      res.json({ processed_items: processedItems });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to process batch sync',
        timestamp: new Date(),
        path: req.path
      });
    }
  });

  // Health check endpoint
  router.get('/health', async (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  return router;
}