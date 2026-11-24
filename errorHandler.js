/**
 * Centralized Error Handling Middleware
 */

function errorHandler(err, req, res, next) {
  console.error(`💥 [Error] ${req.method} ${req.url}:`, err);

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.status || 500);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || null,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Resource not found at: ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
