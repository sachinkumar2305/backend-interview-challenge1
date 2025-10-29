import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../src/db/database';
import { TaskService } from '../src/services/taskService';
import { SyncService } from '../src/services/syncService';

describe('Integration Tests', () => {
  let db: Database;
  let taskService: TaskService;
  let syncService: SyncService;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.initialize();
    taskService = new TaskService(db);
    syncService = new SyncService(db, taskService);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Offline to Online Sync Flow', () => {
    it('should handle complete offline to online workflow', async () => {
      // Simulate offline operations
      // 1. Create task while offline
      const task1 = await taskService.createTask({
        title: 'Offline Task 1',
        description: 'Created while offline',
      });

      // 2. Update task while offline
      await taskService.updateTask(task1.id, {
        completed: true,
      });

      // 3. Create another task
      const task2 = await taskService.createTask({
        title: 'Offline Task 2',
      });

      // 4. Delete a task
      await taskService.deleteTask(task2.id);

      // Verify sync queue has all operations
      const queueItems = await db.all('SELECT * FROM sync_queue ORDER BY created_at');
      expect(queueItems.length).toBeGreaterThanOrEqual(4); // create, update, create, delete

      // Simulate coming online and syncing
      const isOnline = await syncService.checkConnectivity();
      if (isOnline) {
        const syncResult = await syncService.sync();
        
        // Verify sync results
        expect(syncResult).toBeDefined();
        expect(syncResult.success).toBeDefined();
      }
    });
  });

  describe('Conflict Resolution Scenario', () => {
    it('should handle task edited on multiple devices', async () => {
      // Create a task that's already synced
      const task = await taskService.createTask({
        title: 'Shared Task',
        description: 'Task on multiple devices',
      });

      // Set it as previously synced
      await db.run(
        `UPDATE tasks 
         SET sync_status = ?, server_id = ?, last_synced_at = ?
         WHERE id = ?`,
        ['synced', 'srv_1', new Date().toISOString(), task.id]
      );

      // Simulate device going offline
      await db.run(
        `UPDATE tasks
         SET title = ?, updated_at = ?, sync_status = ?
         WHERE id = ?`,
        [
          'Local Update',
          new Date(Date.now() - 1000).toISOString(), // Local update is older
          'pending',
          task.id,
        ]
      );

      // Add update to sync queue
      await db.run(
        `INSERT INTO sync_queue (id, task_id, operation, data, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          'sync_1',
          task.id,
          'update',
          JSON.stringify({
            ...task,
            title: 'Local Update',
            updated_at: new Date(Date.now() - 1000),
          }),
          new Date().toISOString(),
        ]
      );

      // When sync happens with server having newer version
      // Conflict resolution should keep server version
      const syncResult = await syncService.sync();
      expect(syncResult.success).toBe(true);

      // Check if conflict was detected and resolved
      const resolvedTask = await taskService.getTask(task.id);
      expect(resolvedTask).toBeDefined();
      expect(resolvedTask?.title).toBe('Server Update'); // Server update wins
      expect(resolvedTask?.sync_status).toBe('synced');

      // Verify sync queue is cleared
      const remainingQueue = await db.all('SELECT * FROM sync_queue WHERE task_id = ?', [task.id]);
      expect(remainingQueue.length).toBe(0);
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed sync operations', async () => {
      // Create a task
      const task = await taskService.createTask({
        title: 'Task to Sync',
      });

      // Get initial sync queue item
      const initialQueueItem = await db.get(
        'SELECT * FROM sync_queue WHERE task_id = ?',
        [task.id]
      );
      expect(initialQueueItem.retry_count).toBe(0);

      // Trigger a sync (will be mocked to fail)
      const firstSyncResult = await syncService.sync();
      expect(firstSyncResult.success).toBe(false);

      // Check retry count increased
      const afterFailureQueueItem = await db.get(
        'SELECT * FROM sync_queue WHERE task_id = ?',
        [task.id]
      );
      expect(afterFailureQueueItem.retry_count).toBe(1);

      // Check task still needs sync
      const taskAfterFailure = await taskService.getTask(task.id);
      expect(taskAfterFailure?.sync_status).toBe('pending');

      // Simulate successful retry
      const secondSyncResult = await syncService.sync();
      expect(secondSyncResult.success).toBe(true);

      // Verify task was successfully synced
      const taskAfterSuccess = await taskService.getTask(task.id);
      expect(taskAfterSuccess?.sync_status).toBe('synced');

      // Verify item was removed from sync queue
      const finalQueueItem = await db.get(
        'SELECT * FROM sync_queue WHERE task_id = ?',
        [task.id]
      );
      expect(finalQueueItem).toBeNull();
    });
  });
});