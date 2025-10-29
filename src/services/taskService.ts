import { v4 as uuidv4 } from 'uuid';
import { Task } from '../types';
import { Database } from '../db/database';

export class TaskService {
  constructor(private db: Database) {}

  async createTask(taskData: Partial<Task>): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      title: taskData.title!,
      description: taskData.description,
      completed: taskData.completed || false,
      created_at: new Date(),
      updated_at: new Date(),
      is_deleted: false,
      sync_status: 'pending'
    };

    await this.db.run(
      `INSERT INTO tasks (id, title, description, completed, created_at, updated_at, is_deleted, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.description,
        task.completed ? 1 : 0,
        task.created_at.toISOString(),
        task.updated_at.toISOString(),
        task.is_deleted ? 1 : 0,
        task.sync_status
      ]
    );

    // Add to sync queue
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        task.id,
        'create',
        JSON.stringify(task),
        new Date().toISOString()
      ]
    );

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existingTask = await this.getTask(id);
    if (!existingTask) {
      return null;
    }

    const updatedTask = {
      ...existingTask,
      ...updates,
      updated_at: new Date(),
      sync_status: 'pending' as const
    };

    await this.db.run(
      `UPDATE tasks 
       SET title = ?, description = ?, completed = ?, updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [
        updatedTask.title,
        updatedTask.description,
        updatedTask.completed ? 1 : 0,
        updatedTask.updated_at.toISOString(),
        updatedTask.sync_status,
        id
      ]
    );

    // Add to sync queue
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        id,
        'update',
        JSON.stringify(updatedTask),
        new Date().toISOString()
      ]
    );

    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.getTask(id);
    if (!task) {
      return false;
    }

    // Soft delete by updating is_deleted flag
    await this.db.run(
      `UPDATE tasks 
       SET is_deleted = 1, updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [new Date().toISOString(), 'pending', id]
    );

    // Add to sync queue
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        id,
        'delete',
        JSON.stringify({ ...task, is_deleted: true }),
        new Date().toISOString()
      ]
    );

    return true;
  }

  async getTask(id: string): Promise<Task | null> {
    const row = await this.db.get(
      `SELECT * FROM tasks WHERE id = ? AND is_deleted = 0`,
      [id]
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined
    };
  }

  async getAllTasks(): Promise<Task[]> {
    const rows = await this.db.all(
      `SELECT * FROM tasks WHERE is_deleted = 0`
    );

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined
    }));
  }

  async getTasksNeedingSync(): Promise<Task[]> {
    const rows = await this.db.all(
      `SELECT * FROM tasks WHERE sync_status IN ('pending', 'error')`
    );

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      completed: Boolean(row.completed),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: Boolean(row.is_deleted),
      sync_status: row.sync_status,
      server_id: row.server_id,
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined
    }));
  }
}