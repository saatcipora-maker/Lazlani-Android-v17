import type { LoveMessage } from '@workspace/api-client-react';

export function mergeLoveMessages(existing: LoveMessage[], incoming: LoveMessage): LoveMessage[] {
  const existingIdx = existing.findIndex(m => m.id === incoming.id || (m.clientMessageId && m.clientMessageId === incoming.clientMessageId));
  if (existingIdx >= 0) {
    const prev = existing[existingIdx];
    if (incoming.version >= prev.version) {
      const copy = [...existing];
      copy[existingIdx] = { ...prev, ...incoming };
      return copy;
    }
    return existing;
  }
  // If not found, insert at top (sorted by createdAt desc)
  const copy = [incoming, ...existing];
  copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return copy;
}
