import { Request, Response, NextFunction } from 'express';
import { Task, SyncQueueItem } from '../types';

export function validateTaskCreate(req: Request, res: Response, next: NextFunction) {
  const { title, description } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({
      error: 'Title is required and must be a non-empty string',
      timestamp: new Date(),
      path: req.path
    });
  }

  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).json({
      error: 'Description must be a string',
      timestamp: new Date(),
      path: req.path
    });
  }

  next();
}

export function validateTaskUpdate(req: Request, res: Response, next: NextFunction) {
  const { title, description, completed } = req.body;

  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({
      error: 'Request body cannot be empty',
      timestamp: new Date(),
      path: req.path
    });
  }

  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    return res.status(400).json({
      error: 'Title must be a non-empty string',
      timestamp: new Date(),
      path: req.path
    });
  }

  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).json({
      error: 'Description must be a string',
      timestamp: new Date(),
      path: req.path
    });
  }

  if (completed !== undefined && typeof completed !== 'boolean') {
    return res.status(400).json({
      error: 'Completed must be a boolean',
      timestamp: new Date(),
      path: req.path
    });
  }

  next();
}

export function validateSyncBatch(req: Request, res: Response, next: NextFunction) {
  const { items, client_timestamp } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({
      error: 'items must be an array',
      timestamp: new Date(),
      path: req.path
    });
  }

  if (!client_timestamp || isNaN(new Date(client_timestamp).getTime())) {
    return res.status(400).json({
      error: 'client_timestamp must be a valid date',
      timestamp: new Date(),
      path: req.path
    });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.task_id || !item.operation || !item.data) {
      return res.status(400).json({
        error: `Invalid sync item at index ${i}: missing required fields`,
        timestamp: new Date(),
        path: req.path
      });
    }

    if (!['create', 'update', 'delete'].includes(item.operation)) {
      return res.status(400).json({
        error: `Invalid operation '${item.operation}' at index ${i}`,
        timestamp: new Date(),
        path: req.path
      });
    }
  }

  next();
}