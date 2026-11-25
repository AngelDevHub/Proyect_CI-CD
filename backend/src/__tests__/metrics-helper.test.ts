import {
  classifyStatusCode,
  isErrorStatusCode,
  calculateErrorRate,
  getLatencyBucket,
  formatBytes,
} from '../utils/metrics-helper';

describe('Unit Test Suite — Telemetry & Metrics Helpers', () => {
  // ==========================================================================
  // 1. classifyStatusCode
  // ==========================================================================
  describe('classifyStatusCode', () => {
    test.each([
      [100, '1xx'],
      [101, '1xx'],
      [200, '2xx'],
      [201, '2xx'],
      [204, '2xx'],
      [301, '3xx'],
      [302, '3xx'],
      [304, '3xx'],
      [400, '4xx'],
      [401, '4xx'],
      [403, '4xx'],
      [404, '4xx'],
      [409, '4xx'],
      [500, '5xx'],
      [502, '5xx'],
      [503, '5xx'],
      [504, '5xx'],
      [99, 'unknown'],
      [600, 'unknown'],
      [NaN, 'unknown'],
    ])('classifies status code %p as %p', (code, expectedCategory) => {
      expect(classifyStatusCode(code)).toBe(expectedCategory);
    });
  });

  // ==========================================================================
  // 2. isErrorStatusCode
  // ==========================================================================
  describe('isErrorStatusCode', () => {
    test.each([
      [200, false],
      [201, false],
      [302, false],
      [400, true],
      [401, true],
      [404, true],
      [500, true],
      [503, true],
    ])('isErrorStatusCode(%p) returns %p', (code, isError) => {
      expect(isErrorStatusCode(code)).toBe(isError);
    });
  });

  // ==========================================================================
  // 3. calculateErrorRate
  // ==========================================================================
  describe('calculateErrorRate', () => {
    test.each([
      [100, 0, 0],
      [100, 5, 5],
      [100, 50, 50],
      [100, 100, 100],
      [200, 3, 1.5],
      [300, 1, 0.33],
      [0, 0, 0], // Zero total division protection
      [-10, 5, 0],
      [100, -5, 0],
      [50, 100, 100], // Clamped to 100%
    ])('calculates error rate for %p total and %p errors -> %p%', (total, errors, expectedRate) => {
      expect(calculateErrorRate(total, errors)).toBe(expectedRate);
    });
  });

  // ==========================================================================
  // 4. getLatencyBucket
  // ==========================================================================
  describe('getLatencyBucket', () => {
    test.each([
      [-5, '<10ms'],
      [0, '<10ms'],
      [5, '<10ms'],
      [9.9, '<10ms'],
      [10, '10-50ms'],
      [25, '10-50ms'],
      [49.9, '10-50ms'],
      [50, '50-200ms'],
      [150, '50-200ms'],
      [199, '50-200ms'],
      [200, '200-1000ms'],
      [500, '200-1000ms'],
      [999, '200-1000ms'],
      [1000, '>1000ms'],
      [5000, '>1000ms'],
    ])('assigns latency %p ms to bucket %p', (latency, bucket) => {
      expect(getLatencyBucket(latency)).toBe(bucket);
    });
  });

  // ==========================================================================
  // 5. formatBytes
  // ==========================================================================
  describe('formatBytes', () => {
    test.each([
      [0, '0 B'],
      [-100, '0 B'],
      [500, '500.00 B'],
      [1024, '1.00 KB'],
      [1536, '1.50 KB'],
      [1048576, '1.00 MB'],
      [1073741824, '1.00 GB'],
    ])('formats bytes %p -> %p', (bytes, formatted) => {
      expect(formatBytes(bytes)).toBe(formatted);
    });
  });
});
