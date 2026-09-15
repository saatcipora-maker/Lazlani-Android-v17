export function parseStoredUserId(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { id?: unknown };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

export function resolveLegacyOwnerUserId(
  currentValue: string | null,
  historicalValue: string | null,
): string | null {
  const currentId = parseStoredUserId(currentValue);
  const historicalId = parseStoredUserId(historicalValue);
  if (currentId && historicalId && currentId !== historicalId) return null;
  return historicalId ?? currentId;
}