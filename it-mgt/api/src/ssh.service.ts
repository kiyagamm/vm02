import { Injectable } from '@nestjs/common';
import { Client } from 'ssh2';

export interface SshTarget { host: string; port: number; username: string; password: string }
export interface SshResult { stdout: string; stderr: string; exitCode: number | null }

const MAX_OUTPUT = 256 * 1024;
const TIMEOUT_MS = Number(process.env.SSH_COMMAND_TIMEOUT_MS ?? 30000);

@Injectable()
export class SshService {
  run(target: SshTarget, command: string): Promise<SshResult> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';
      let done = false;
      const finish = (err: Error | null, res?: SshResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        conn.end();
        err ? reject(err) : resolve(res!);
      };
      const timer = setTimeout(() => finish(new Error(`SSH command timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
      const append = (cur: string, chunk: Buffer) => (cur.length < MAX_OUTPUT ? cur + chunk.toString('utf8') : cur);

      conn
        .on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) return finish(err);
            stream
              .on('close', (code: number | null) => finish(null, { stdout, stderr, exitCode: code }))
              .on('data', (d: Buffer) => (stdout = append(stdout, d)));
            stream.stderr.on('data', (d: Buffer) => (stderr = append(stderr, d)));
          });
        })
        .on('error', (e) => finish(e))
        .connect({
          host: target.host,
          port: target.port,
          username: target.username,
          password: target.password,
          readyTimeout: 10000,
        });
    });
  }
}
