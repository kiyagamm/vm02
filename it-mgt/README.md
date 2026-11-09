# IT Client-Support Management Dashboard

Angular + NestJS (TypeScript) + PostgreSQL, run with Docker Compose (nginx `web`, `api`, `db`).

## Quick start

```bash
cp .env.example .env        # then edit secrets
openssl rand -hex 32        # -> ENCRYPTION_KEY
openssl rand -base64 48     # -> JWT_SECRET
docker compose up --build
```

Open http://localhost:8080 and sign in with `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`
(the admin is created on first start when no users exist). Create other users under **Users**.

## Roles

| Capability | admin | engineer | viewer |
|---|---|---|---|
| View clients/devices/VMs | ✔ | ✔ | ✔ |
| Create / edit | ✔ | ✔ | ✖ |
| Delete | ✔ | ✖ | ✖ |
| Reveal / copy passwords | ✔ | ✔ | ✖ (masked) |
| Run SSH commands | any | all except a destructive denylist (`api/src/command-policy.ts`) | ✖ |
| Users, audit log | ✔ | ✖ | ✖ |

## Design notes

- **Hypervisor** = a Device with `type = hypervisor` and a `platform` (Proxmox, VMware, Hyper-V). VMs belong to such devices.
- Credentials belong to a device **or** a VM. Passwords are encrypted with AES-256-GCM (`ENCRYPTION_KEY`, 32 bytes as 64 hex chars or base64; format `v1:iv:tag:ciphertext`). List endpoints never return passwords; `POST /api/credentials/:id/reveal` checks the role and writes a `reveal-password` audit entry (the UI's Reveal and Copy both use it).
- SSH execution: `POST /api/exec {credentialId, command}` connects to the device host (port = device port for SSH credentials, else 22) or the VM IP. Every attempt, including denied ones, is audited as `command-run`. Timeout and 256 KB output cap apply. Host keys are **not** verified yet; use on trusted networks.
- Audit log records user, action, entity, details, IP and timestamp (create, update, delete, reveal-password, command-run, plus login/login-failed).
- Metadata JSON columns on devices and VMs allow adding fields without migrations.
- The schema is created with TypeORM `synchronize` for simplicity; switch to migrations before production changes.
- Back up the `dbdata` volume **and** the `ENCRYPTION_KEY`.

## Development

```bash
cd api && npm install && npm test && npm run build
cd web && npm install && npx ng test --watch=false && npx ng build
```

API routes live under `/api` (`auth`, `users`, `clients`, `devices`, `vms`, `credentials`, `exec`, `audit`, `search`).
