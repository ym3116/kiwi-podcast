export function durationLabelToSeconds(durationLabel: string | undefined): number {
  const clock = durationLabel?.trim().match(/^(\d+):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const minutes = Number(durationLabel?.match(/(\d+)/)?.[1] ?? 10);
  return minutes * 60;
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}
