import axios from 'axios';
import { Task, SyncQueueItem, SyncResult, BatchSyncRequest, BatchSyncResponse } from '../types';
import { Database } from '../db/database';
import { TaskService } from './taskService';

export class SyncService {
  private apiUrl: string;
  
  constructor(
    private db: Database,
    private taskService: TaskService,
    apiUrl: string = process.env.API_BASE_URL || 'http://localhost:3000/api'
  ) {
    this.apiUrl = apiUrl;
  }

  async sync(): Promise<SyncResult> {
    const isOnline = await this.checkConnectivity();
    if (!isOnline) {
      return {
        success: false,
        synced_items: 0,
        failed_items: 0,
        errors: [{
          task_id: '',
          operation: 'sync',
          error: 'Server is not reachable',
          timestamp: new Date()
        }]
      };
    }

    const syncQueueItems = await this.db.all(
      `SELECT * FROM sync_queue WHERE retry_count < 3 ORDER BY created_at ASC`
    );

    if (syncQueueItems.length === 0) {
      return {
        success: true,
        synced_items: 0,
        failed_items: 0,
        errors: []
      };
    }

    const BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || '50');
    const batches = [];
    for (let i = 0; i < syncQueueItems.length; i += BATCH_SIZE) {
      batches.push(syncQueueItems.slice(i, i + BATCH_SIZE));
    }

    let syncedItems = 0;
    let failedItems = 0;
    const errors: Array<{task_id: string, operation: string, error: string, timestamp: Date}> = [];

    for (const batch of batches) {
      try {
        const batchResponse = await this.processBatch(batch);
        for (const item of batchResponse.processed_items) {
          if (item.status === 'success') {
            await this.updateSyncStatus(item.client_id, 'synced', item.resolved_data);
            syncedItems++;
          } else {
            await this.handleSyncError(batch.find(b => b.task_id === item.client_id)!, new Error(item.error || 'Sync failed'));
            failedItems++;
            errors.push({
              task_id: item.client_id,
              operation: batch.find(b => b.task_id === item.client_id)?.operation || 'unknown',
              error: item.error || 'Sync failed',
              timestamp: new Date()
            });
          }
        }
      } catch (error) {
        for (const item of batch) {
          await this.handleSyncError(item, error as Error);
          failedItems++;
          errors.push({
            task_id: item.task_id,
            operation: item.operation,
            error: (error as Error).message,
            timestamp: new Date()
          });
        }
      }
    }

    return {
      success: failedItems === 0,
      synced_items: syncedItems,
      failed_items: failedItems,
      errors
    };
  }

  async addToSyncQueue(taskId: string, operation: 'create' | 'update' | 'delete', data: Partial<Task>): Promise<void> {
    const syncItem: SyncQueueItem = {
      id: Math.random().toString(36).substring(2, 15),
      task_id: taskId,
      operation,
      data,
      created_at: new Date(),
      retry_count: 0
    };

    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at, retry_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        syncItem.id,
        syncItem.task_id,
        syncItem.operation,
        JSON.stringify(syncItem.data),
        syncItem.created_at.toISOString(),
        syncItem.retry_count
      ]
    );
  }

  private async processBatch(items: SyncQueueItem[]): Promise<BatchSyncResponse> {
    const batchRequest: BatchSyncRequest = {
      items: items.map(item => ({
        ...item,
        data: typeof item.data === 'string' ? JSON.parse(item.data) : item.data
      })),
      client_timestamp: new Date()
    };

    const response = await axios.post<BatchSyncResponse>(
      `${this.apiUrl}/sync/batch`,
      batchRequest,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const processedItems = response.data.processed_items;
    for (const item of processedItems) {
      if (item.status === 'conflict') {
        const localTask = await this.taskService.getTask(item.client_id);
        if (localTask && item.resolved_data) {
          item.resolved_data = await this.resolveConflict(localTask, item.resolved_data as Task);
          item.status = 'success';
        }
      }
    }

    return {
      processed_items: processedItems
    };
  }

  private async resolveConflict(localTask: Task, serverTask: Task): Promise<Task> {
    // Implement last-write-wins conflict resolution
    const localTimestamp = localTask.updated_at.getTime();
    const serverTimestamp = serverTask.updated_at.getTime();

    const winningTask = localTimestamp > serverTimestamp ? localTask : serverTask;
    console.log(`Conflict resolved for task ${localTask.id}: ${localTimestamp > serverTimestamp ? 'local' : 'server'} version won`);
    
    return winningTask;
  }

  private async updateSyncStatus(taskId: string, status: 'synced' | 'error', serverData?: Partial<Task>): Promise<void> {
    const updateFields = [
      `sync_status = ?`,
      `last_synced_at = ?`
    ];
    const params = [status, new Date().toISOString()];

    if (serverData?.server_id) {
      updateFields.push('server_id = ?');
      params.push(serverData.server_id);
    }

    // Update task sync status
    await this.db.run(
      `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`,
      [...params, taskId]
    );

    // Remove from sync queue if synced successfully
    if (status === 'synced') {
      await this.db.run(
        `DELETE FROM sync_queue WHERE task_id = ?`,
        [taskId]
      );
    }
  }

  private async handleSyncError(item: SyncQueueItem, error: Error): Promise<void> {
    const retryCount = item.retry_count + 1;
    const errorMessage = error.message || 'Unknown error';

    // Update sync queue item
    await this.db.run(
      `UPDATE sync_queue 
       SET retry_count = ?, error_message = ?
       WHERE id = ?`,
      [retryCount, errorMessage, item.id]
    );

    // If retry count exceeds limit, mark task as permanent failure
    if (retryCount >= 3) {
      await this.db.run(
        `UPDATE tasks 
         SET sync_status = ?, error_message = ?
         WHERE id = ?`,
        ['error', `Max retries exceeded: ${errorMessage}`, item.task_id]
      );

      // Remove from sync queue
      await this.db.run(
        `DELETE FROM sync_queue WHERE id = ?`,
        [item.id]
      );
    }
  }

  async checkConnectivity(): Promise<boolean> {
    // TODO: Check if server is reachable
    // 1. Make a simple health check request
    // 2. Return true if successful, false otherwise
    try {
      await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}