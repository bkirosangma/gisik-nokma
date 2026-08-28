export type AvatarProps = { name: string; size?: 'small' | 'medium' };

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '?';
  const last = words[words.length - 1] ?? first;
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

export function Avatar({ name, size = 'medium' }: AvatarProps) {
  return (
    <span className={`gn-avatar gn-avatar--${size}`} title={name} aria-label={name}>
      {initialsOf(name)}
    </span>
  );
}
