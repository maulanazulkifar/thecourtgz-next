export function discordAvatarUrl(
  discordId?: string | null,
  discordAvatar?: string | null,
): string | null {
  if (!discordId || !discordAvatar) return null;
  return `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.png`;
}
