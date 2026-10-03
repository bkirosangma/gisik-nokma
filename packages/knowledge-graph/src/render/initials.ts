export function initialsOf(name: string): string {
  return name.split(' ').filter((word) => word !== '').map((word) => [...word][0]).join('').slice(0, 2).toUpperCase();
}
