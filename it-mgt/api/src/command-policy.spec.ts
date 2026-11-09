import { checkCommand } from './command-policy';

describe('checkCommand', () => {
  it('denies viewers', () => {
    expect(checkCommand('viewer', 'uptime').allowed).toBe(false);
  });
  it('lets engineers run normal commands', () => {
    for (const c of ['uptime', 'df -h', 'systemctl status nginx', 'rm -rf /tmp/foo', 'ls /var/log']) {
      expect(checkCommand('engineer', c).allowed).toBe(true);
    }
  });
  it('blocks destructive commands for engineers', () => {
    for (const c of ['rm -rf /', 'sudo rm -rf / --no-preserve-root', 'reboot', 'mkfs.ext4 /dev/sda1', 'dd if=/dev/zero of=/dev/sda', 'passwd root']) {
      expect(checkCommand('engineer', c).allowed).toBe(false);
    }
  });
  it('lets admins run anything', () => {
    expect(checkCommand('admin', 'reboot').allowed).toBe(true);
  });
});
