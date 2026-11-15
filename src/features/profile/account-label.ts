/** Chart profile names that were copied onto every account. */
export function isPlaceholderAccountName(name: string): boolean {
  return /^(radiar|forge|forge trader|trader|layout|save|saved)$/i.test(name.trim());
}

export interface SignedInAccount {
  readonly userId: string;
  readonly displayName: string;
  readonly username: string;
  readonly safetyName?: string;
}

export interface MenuAccountLabel {
  readonly displayName: string;
  readonly handle: string;
  readonly initial: string;
}

function localPart(username: string): string {
  const raw = username.trim();
  if (!raw) return "";
  const at = raw.indexOf("@");
  return (at >= 0 ? raw.slice(0, at) : raw).trim();
}

function belongsToAccount(storedUsername: string, account: SignedInAccount): boolean {
  const stored = storedUsername.trim().toLowerCase();
  const session = account.username.trim().toLowerCase();
  if (!stored || !session) return false;
  if (stored === session) return true;
  const local = localPart(session);
  return Boolean(local) && stored === local;
}

/**
 * The account menu shows the person who signed in.
 * A chart profile named Radiar / @iradiar must not follow every other user.
 */
export function menuAccountLabel(
  account: SignedInAccount,
  stored?: { readonly displayName?: string; readonly username?: string },
): MenuAccountLabel {
  const sessionName = account.displayName.trim();
  const safety = account.safetyName?.trim() ?? "";
  const storedName = stored?.displayName?.trim() ?? "";
  const belongs = belongsToAccount(stored?.username ?? "", account);
  const owner = account.userId === "owner-radiarkazemi" || /radiarkazemi/i.test(account.username);

  let displayName = sessionName;
  if (belongs && storedName) displayName = storedName;
  else if (!owner && /^radiar$/i.test(sessionName)) {
    const local = localPart(account.username);
    if (safety && !isPlaceholderAccountName(safety)) displayName = safety;
    else if (local && !/^radiar$/i.test(local)) displayName = local;
  }
  if (!displayName) displayName = safety || localPart(account.username) || "Account";

  const handleSource = localPart(account.username) || account.username.trim();
  const handle = handleSource.startsWith("@") ? handleSource : `@${handleSource}`;
  const initial = displayName.slice(0, 1).toUpperCase() || "F";
  return { displayName, handle, initial };
}
