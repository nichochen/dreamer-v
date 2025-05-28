export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '/api';
export const HEALTH_CHECK_URL = `${BACKEND_URL}/health`;

// Canonical task statuses
export const STATUS_PENDING = 'pending';
export const STATUS_PROCESSING = 'processing';
export const STATUS_COMPLETED = 'completed';
export const STATUS_FAILED = 'failed';
export const STATUS_ERROR = 'error'; // Can come from backend or be set client-side
export const STATUS_INITIALIZING = 'initializing'; // Custom UI state before backend task creation
export const STATUS_COMPLETED_WAITING_URI = 'completed_waiting_uri'; // Custom UI state when backend says 'completed' but URI is missing
