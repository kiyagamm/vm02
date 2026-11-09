import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type Role = 'admin' | 'engineer' | 'viewer';
export const ROLES: Role[] = ['admin', 'engineer', 'viewer'];
export const DEVICE_TYPES = ['server', 'hypervisor', 'switch', 'router', 'firewall', 'other'] as const;
export const CREDENTIAL_TYPES = ['ssh', 'rdp', 'web', 'snmp', 'database', 'other'] as const;

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) name: string;
  @Column({ type: 'text', nullable: true }) logo: string | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) username: string;
  @Column() passwordHash: string;
  @Column({ type: 'varchar', default: 'viewer' }) role: Role;
  @Column({ default: true }) active: boolean;
  /** Super admins manage organisations and may enter any of them. */
  @Column({ default: false }) isSuperAdmin: boolean;
  @ManyToMany(() => Organization)
  @JoinTable({ name: 'user_organizations' }) organizations: Organization[];
  @CreateDateColumn() createdAt: Date;
}

@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn() key: string;
  @Column({ type: 'text', nullable: true }) value: string | null;
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid', nullable: true }) organizationId: string | null;
  @ManyToOne(() => Organization, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'organizationId' }) organization: Organization;
  @Column() name: string;
  @Column({ type: 'varchar', nullable: true }) contact: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @OneToMany(() => Device, (d) => d.client) devices: Device[];
  @CreateDateColumn() createdAt: Date;
}

/** A hypervisor is a Device with type = 'hypervisor' (platform: proxmox, vmware, hyperv...). */
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() clientId: string;
  @ManyToOne(() => Client, (c) => c.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' }) client: Client;
  @Column() name: string;
  @Column({ type: 'varchar', default: 'server' }) type: string;
  @Column({ type: 'varchar', nullable: true }) host: string | null;
  @Column({ type: 'int', nullable: true }) port: number | null;
  @Column({ type: 'varchar', nullable: true }) os: string | null;
  @Column({ type: 'varchar', nullable: true }) platform: string | null;
  @Column({ type: 'varchar', nullable: true }) brand: string | null;
  @Column({ type: 'varchar', nullable: true }) model: string | null;
  @Column({ type: 'varchar', nullable: true }) location: string | null;
  @Column({ type: 'date', nullable: true }) deploymentDate: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'jsonb', default: {} }) metadata: Record<string, unknown>;
  @OneToMany(() => Vm, (v) => v.device) vms: Vm[];
  @OneToMany(() => Credential, (c) => c.device) credentials: Credential[];
  @CreateDateColumn() createdAt: Date;
}

@Entity('vms')
export class Vm {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() deviceId: string;
  @ManyToOne(() => Device, (d) => d.vms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' }) device: Device;
  @Column() name: string;
  @Column({ type: 'varchar', nullable: true }) ip: string | null;
  @Column({ type: 'varchar', nullable: true }) os: string | null;
  @Column({ type: 'int', nullable: true }) cpu: number | null;
  @Column({ type: 'int', nullable: true }) ramMb: number | null;
  @Column({ type: 'int', nullable: true }) diskGb: number | null;
  @Column({ default: 'running' }) status: string;
  @Column({ type: 'varchar', nullable: true }) purpose: string | null;
  @Column({ type: 'jsonb', default: {} }) metadata: Record<string, unknown>;
  @OneToMany(() => Credential, (c) => c.vm) credentials: Credential[];
  @CreateDateColumn() createdAt: Date;
}

@Entity('credentials')
export class Credential {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid', nullable: true }) deviceId: string | null;
  @ManyToOne(() => Device, (d) => d.credentials, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'deviceId' }) device: Device;
  @Index() @Column({ type: 'uuid', nullable: true }) vmId: string | null;
  @ManyToOne(() => Vm, (v) => v.credentials, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'vmId' }) vm: Vm;
  @Column() username: string;
  @Column({ type: 'text' }) passwordEnc: string;
  @Column({ default: 'ssh' }) type: string;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid', nullable: true }) organizationId: string | null;
  @Column({ type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'varchar', nullable: true }) username: string | null;
  @Column() action: string;
  @Column() entity: string;
  @Column({ type: 'varchar', nullable: true }) entityId: string | null;
  @Column({ type: 'text', nullable: true }) details: string | null;
  @Column({ type: 'varchar', nullable: true }) ip: string | null;
  @Index() @CreateDateColumn() timestamp: Date;
}

@Entity('config_snippets')
export class ConfigSnippet {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() clientId: string;
  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' }) client: Client;
  @Index() @Column() deviceId: string;
  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceId' }) device: Device;
  @Column() name: string;
  @Column({ type: 'text' }) content: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('signup_requests')
export class SignupRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() username: string;
  @Column() passwordHash: string;
  @Column({ type: 'varchar' }) type: 'new-org' | 'join';
  @Column() organizationName: string;
  @CreateDateColumn() createdAt: Date;
}

export const ALL_ENTITIES = [SignupRequest, Organization, User, Client, Device, Vm, Credential, AuditLog, AppSetting, ConfigSnippet];
