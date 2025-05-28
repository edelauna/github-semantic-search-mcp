/**
 * Structured logging utility for consistent log formatting across the application.
 */
export const log = {
  /**
   * Debug level logging for detailed troubleshooting information
   */
  debug: (context: string, message: string, data?: any) => {
    console.log(`[DEBUG][${context}] ${message}`, data ? data : '');
  },

  /**
   * Info level logging for general operational information
   */
  info: (context: string, message: string, data?: any) => {
    console.log(`[INFO][${context}] ${message}`, data ? data : '');
  },

  /**
   * Warning level logging for potentially problematic situations
   */
  warn: (context: string, message: string, data?: any) => {
    console.log(`[WARN][${context}] ${message}`, data ? data : '');
  },

  /**
   * Error level logging for error conditions
   */
  error: (context: string, message: string, error?: any) => {
    console.error(`[ERROR][${context}] ${message}`, error ? error : '');
  }
};
