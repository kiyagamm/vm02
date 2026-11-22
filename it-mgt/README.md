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
- Device configuration files can be uploaded when creating or editing a device. Files up to 25 MiB are stored in PostgreSQL, available to admins and engineers from the device, and included in database backups.
- Organisation viewers and admins can create and view asset movement and equipment entry forms under **Forms**; only admins can edit or delete them. Engineers cannot access forms. Forms can be printed or saved as PDF and use the current organisation logo. For an asset not in the register, select **Other** and enter its description and details manually; its serial number is optional. Equipment entries are separate from client devices and require an organisation-unique serial number, matched without case or surrounding spaces. A manually entered serial number also participates in matching. The latest matching movement by movement date, then creation time, determines delivery: outbound sets the destination; inbound clears delivery. Older movement forms are outbound. Editing or deleting movements recalculates the result. Forms are deleted with their organisation.
- Movement forms select equipment by name and serial number; delivered items are hidden for new outbound selections but available for returns and existing forms. Name, serial, tag, brand and model are saved on the form. Organisation users can generate and print delivered equipment, in-store equipment and client device reports from **Reports**; these reports do not include credentials.
- Reverse proxies must allow multipart requests of at least 26 MiB for `/api/devices/<id>/config-files`; the bundled nginx configuration sets this limit for that endpoint.
- The schema is created with TypeORM `synchronize` for simplicity; switch to migrations before production changes.
- Back up the `dbdata` volume **and** the `ENCRYPTION_KEY`.

## Development

```bash
cd api && npm install && npm test && npm run build
cd web && npm install && npx ng test --watch=false && npx ng build
```

API routes live under `/api` (`auth`, `users`, `clients`, `devices`, `vms`, `credentials`, `exec`, `audit`, `search`).
