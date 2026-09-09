export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localDateTime(value: string): string {
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function isOverdue(
  dueDate: string | null,
  completed: boolean,
  today = localDate(),
): boolean {
  return !completed && !!dueDate && dueDate < today;
}
export function progress(completed: number, total: number): number {
  return total ? Math.round((completed / total) * 100) : 0;
}
