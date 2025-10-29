# Backend Interview Challenge - Task Sync API

This is a backend developer interview challenge focused on building a sync-enabled task management API. The solution provides a robust implementation of task management with offline support, data synchronization, and conflict resolution.

## Implementation Details

### Architecture Overview

The solution implements a comprehensive offline-first task management system with:

1. **SQLite Database Layer**
   - In-memory or file-based storage
   - Tables for tasks and sync queue
   - Transaction support for data integrity

2. **Task Service (`taskService.ts`)**
   - Complete CRUD operations
   - Automatic sync queue updates
   - Soft delete functionality

3. **Sync Service (`syncService.ts`)**
   - Timestamp-based conflict resolution
   - Batch processing with configurable size
   - Retry mechanism with exponential backoff
   - Queue management and error handling

4. **REST API Endpoints**
   - Standard CRUD operations for tasks
   - Sync trigger and status endpoints
   - Health check endpoint
   - Proper error responses

### Sync and Conflict Resolution

The sync mechanism works as follows:

1. **Offline Operations**
   - All CRUD operations are stored locally first
   - Changes are queued in the sync queue table
   - Each operation tracks retry attempts and errors

2. **Sync Process**
   - When online, sync is triggered automatically or manually
   - Changes are sent in batches (configurable size)
   - Last-write-wins conflict resolution based on timestamps
   - Failed operations are retried up to 3 times

3. **Conflict Resolution**
   - Conflicts are detected by comparing timestamps
   - Server version wins if timestamps match
   - All conflict resolutions are logged for auditing
   - Clients receive resolved state in sync response

## 📚 Documentation Overview

Please read these documents in order:

1. **[📋 Submission Instructions](./docs/SUBMISSION_INSTRUCTIONS.md)** - How to submit your solution (MUST READ)
2. **[📝 Requirements](./docs/REQUIREMENTS.md)** - Detailed challenge requirements and implementation tasks
3. **[🔌 API Specification](./docs/API_SPEC.md)** - Complete API documentation with examples
4. **[🤖 AI Usage Guidelines](./docs/AI_GUIDELINES.md)** - Guidelines for using AI tools during the challenge

**⚠️ Important**: DO NOT create pull requests against this repository. All submissions must be through private forks.

## Challenge Overview

Candidates are expected to implement a backend API that:
- Manages tasks (CRUD operations)
- Supports offline functionality with a sync queue
- Handles conflict resolution when syncing
- Provides robust error handling

## Project Structure

```
backend-interview-challenge/
├── src/
│   ├── db/             # Database setup and configuration
│   ├── models/         # Data models (if needed)
│   ├── services/       # Business logic (TO BE IMPLEMENTED)
│   ├── routes/         # API endpoints (TO BE IMPLEMENTED)
│   ├── middleware/     # Express middleware
│   ├── types/          # TypeScript interfaces
│   └── server.ts       # Express server setup
├── tests/              # Test files
├── docs/               # Documentation
└── package.json        # Dependencies and scripts
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/PearlThoughts/backend-interview-challenge.git
   cd backend-interview-challenge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables:
   ```env
   PORT=3000
   SYNC_BATCH_SIZE=50
   DB_PATH=:memory:  # Use :memory: for in-memory SQLite or provide a file path
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

### Testing the API

1. **Create a Task**
   ```bash
   curl -X POST http://localhost:3000/api/tasks \
     -H "Content-Type: application/json" \
     -d '{"title": "Test Task", "description": "This is a test task"}'
   ```

2. **Get All Tasks**
   ```bash
   curl http://localhost:3000/api/tasks
   ```

3. **Update a Task**
   ```bash
   curl -X PUT http://localhost:3000/api/tasks/{taskId} \
     -H "Content-Type: application/json" \
     -d '{"completed": true}'
   ```

4. **Delete a Task**
   ```bash
   curl -X DELETE http://localhost:3000/api/tasks/{taskId}
   ```

5. **Trigger Sync**
   ```bash
   curl -X POST http://localhost:3000/api/sync
   ```

6. **Check Sync Status**
   ```bash
   curl http://localhost:3000/api/status
   ```

### Running Tests

1. **Full Test Suite**
   ```bash
   npm test
   ```

2. **Watch Mode (Development)**
   ```bash
   npm run test:watch
   ```

3. **Test Coverage**
   ```bash
   npm run test:coverage
   ```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm test` - Run tests
- `npm run test:ui` - Run tests with UI
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check TypeScript types

## Your Task

### Key Implementation Files

You'll need to implement the following services and routes:

- `src/services/taskService.ts` - Task CRUD operations
- `src/services/syncService.ts` - Sync logic and conflict resolution  
- `src/routes/tasks.ts` - REST API endpoints
- `src/routes/sync.ts` - Sync-related endpoints

### Before Submission

Ensure all of these pass:
```bash
npm test          # All tests must pass
npm run lint      # No linting errors
npm run typecheck # No TypeScript errors
```

### Time Expectation

This challenge is designed to take 2-3 hours to complete.

## License

This project is for interview purposes only.