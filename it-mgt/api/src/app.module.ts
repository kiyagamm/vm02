import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { JwtAuthGuard, RolesGuard } from './auth';
import {
  AuditController, AuthController, ClientsController, CredentialsController, DevicesController,
  ExecController, SearchController, SettingsController, SnippetsController, UsersController, VmsController,
} from './controllers';
import { CryptoService } from './crypto.service';
import { ALL_ENTITIES, User } from './entities';
import { SshService } from './ssh.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'itmgt',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME ?? 'itmgt',
      entities: ALL_ENTITIES,
      synchronize: true,
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
    }),
  ],
  controllers: [
    AuthController, UsersController, ClientsController, DevicesController, VmsController,
    CredentialsController, ExecController, AuditController,     SearchController, SettingsController, SnippetsController,
  ],
  providers: [
    CryptoService, AuditService, SshService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger('Seed');
  constructor(@InjectRepository(User) private users: Repository<User>) {}

  async onModuleInit() {
    if ((await this.users.count()) > 0) return;
    const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error('SEED_ADMIN_PASSWORD must be set to create the first admin');
    await this.users.save(this.users.create({
      username, role: 'admin', passwordHash: await bcrypt.hash(password, 12),
    }));
    this.logger.log(`Seeded admin user "${username}"`);
  }
}
