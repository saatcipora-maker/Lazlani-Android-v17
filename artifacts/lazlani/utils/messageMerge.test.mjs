import test from 'node:test';
import assert from 'node:assert';
import { mergeLoveMessages } from './messageMerge.ts';

test('mergeLoveMessages merges newer versions', () => {
  const existing = [{ id: '1', version: 1, createdAt: '2025-01-01T00:00:00Z', body: 'old' }];
  const incoming = { id: '1', version: 2, createdAt: '2025-01-01T00:00:00Z', body: 'new' };
  
  const result = mergeLoveMessages(existing, incoming);
  assert.strictEqual(result[0].body, 'new');
});

test('mergeLoveMessages ignores older versions', () => {
  const existing = [{ id: '1', version: 2, createdAt: '2025-01-01T00:00:00Z', body: 'new' }];
  const incoming = { id: '1', version: 1, createdAt: '2025-01-01T00:00:00Z', body: 'old' };
  
  const result = mergeLoveMessages(existing, incoming);
  assert.strictEqual(result[0].body, 'new');
});

test('mergeLoveMessages matches by clientMessageId', () => {
  const existing = [{ id: 'temp-1', clientMessageId: 'c1', version: 0, createdAt: '2025-01-01T00:00:00Z', body: 'test' }];
  const incoming = { id: 'real-1', clientMessageId: 'c1', version: 1, createdAt: '2025-01-01T00:00:00Z', body: 'test' };
  
  const result = mergeLoveMessages(existing, incoming);
  assert.strictEqual(result[0].id, 'real-1');
  assert.strictEqual(result.length, 1);
});

test('mergeLoveMessages sorts correctly', () => {
  const existing = [{ id: '1', version: 1, createdAt: '2025-01-01T00:00:00Z', body: 'first' }];
  const incoming = { id: '2', version: 1, createdAt: '2025-01-02T00:00:00Z', body: 'second' };
  
  const result = mergeLoveMessages(existing, incoming);
  assert.strictEqual(result[0].id, '2'); // newest first
  assert.strictEqual(result[1].id, '1');
});
