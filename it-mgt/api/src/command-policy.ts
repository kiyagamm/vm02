import { Role } from './entities';

const DANGEROUS: RegExp[] = [
  /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(--no-preserve-root\s+)?\/(\s|\*|$)/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+[^|;]*\bof=\/dev\//i,
  /\b(shutdown|reboot|halt|poweroff|init\s+[06])\b/i,
  /:\(\)\s*\{.*\};\s*:/,
  />\s*\/dev\/(sd|nvme|vd)[a-z0-9]*/i,
  /\b(userdel|passwd|chpasswd|visudo)\b/i,
];

/**
 * Admins may run anything. Engineers may run anything except a denylist of
 * destructive commands. Viewers may never run commands.
 */
export function checkCommand(role: Role, command: string): { allowed: boolean; reason?: string } {
  if (role === 'admin') return { allowed: true };
  if (role !== 'engineer') return { allowed: false, reason: 'Your role cannot run commands' };
  const hit = DANGEROUS.find((re) => re.test(command));
  return hit ? { allowed: false, reason: 'Command blocked for engineers (destructive); ask an admin' } : { allowed: true };
}
