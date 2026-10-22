interface ProfileAvatarProps {
  name: string;
  variant?: 'default' | 'new' | 'danger';
}

const initialOf = (name: string) => (Array.from(name)[0] ?? '?').toUpperCase();

/** Circle with the profile's initial. Decorative: the name is always shown next to it. */
export function ProfileAvatar({ name, variant = 'default' }: ProfileAvatarProps) {
  return (
    <span className={`profile-avatar profile-avatar--${variant}`} aria-hidden="true">
      {variant === 'new' ? '+' : initialOf(name)}
    </span>
  );
}
