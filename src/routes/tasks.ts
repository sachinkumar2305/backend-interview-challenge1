import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';
import { SyncService } from '../services/syncService';
import { Database } from '../db/database';
import { Task } from '../types';
import { validateTaskCreate, validateTaskUpdate } from '../middleware/validation';

export function createTaskRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);
  const syncService = new SyncService(db, taskService);

  // Debug logging middleware
  router.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // Get all tasks
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tasks = await taskService.getAllTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  // Get single task
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task = await taskService.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  // Create task
  router.post('/', validateTaskCreate, async (req: Request, res: Response) => {
    try {
      console.log('Received create task request:', req.body);
      const { title, description } = req.body;

      // Basic validation
      if (!title) {
        console.log('Title validation failed');
        return res.status(400).json({
          error: 'Title is required',
          timestamp: new Date().toISOString(),
          path: req.path
        });
      }

      const task = await taskService.createTask({ title, description });
      console.log('Task created successfully:', task);
      
      return res.status(201).json({
        success: true,
        data: task,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating task:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create task',
        timestamp: new Date().toISOString(),
        path: req.path
      });
    }
  });

  // Update task
  router.put('/:id', validateTaskUpdate, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, description, completed } = req.body;

      // Basic validation
      if (Object.keys(req.body).length === 0) {
        return res.status(400).json({
          error: 'Request body cannot be empty',
          timestamp: new Date(),
          path: req.path
        });
      }

      // Build update object with only provided fields
      const updates: Partial<Task> = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (completed !== undefined) updates.completed = completed;

      const updatedTask = await taskService.updateTask(id, updates);
      if (!updatedTask) {
        return res.status(404).json({
          error: 'Task not found',
          timestamp: new Date(),
          path: req.path
        });
      }

      res.json(updatedTask);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to update task',
        timestamp: new Date(),
        path: req.path
      });
    }
  });

  // Delete task
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = await taskService.deleteTask(id);

      if (!success) {
        return res.status(404).json({
          error: 'Task not found',
          timestamp: new Date(),
          path: req.path
        });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: 'Failed to delete task',
        timestamp: new Date(),
        path: req.path
      });
    }
  });

  return router;
}