import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
  MinLength,
} from 'class-validator';
import { CREDENTIAL_TYPES, DEVICE_TYPES, ROLES } from './entities';

export class LoginDto {
  @IsString() username: string;
  @IsString() password: string;
  @IsOptional() @IsUUID() organizationId?: string;
}
export class SignupDto {
  @IsString() @Length(3, 64) username: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
  @IsIn(['new-org', 'join']) type: 'new-org' | 'join';
  @IsString() @Length(1, 100) organizationName: string;
}
export class SwitchOrgDto {
  @IsUUID() organizationId: string;
}
export class CreateOrgDto {
  @IsString() @Length(1, 100) name: string;
}
export class UpdateOrgDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
}
export class SetUserOrgsDto {
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) organizationIds: string[];
}

export class CreateUserDto {
  @IsString() @Length(3, 64) username: string;
  @IsString() @MinLength(8) password: string;
  @IsIn(ROLES) role: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() @Length(3, 64) username?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsIn(ROLES) role?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateProfileDto {
  @IsString() @MinLength(1) currentPassword: string;
  @IsOptional() @IsString() @Length(3, 64) username?: string;
  @IsOptional() @IsString() @MinLength(8) newPassword?: string;
}
export class UpdateBrandingDto {
  @IsOptional() @IsString() @MaxLength(100) companyName?: string | null;
  @IsOptional() @IsString() @MaxLength(700000) @Matches(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/)
  logo?: string | null;
}

export class CreateClientDto {
  @IsString() @Length(1, 200) name: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class CreateDeviceDto {
  @IsUUID() clientId: string;
  @IsString() @Length(1, 200) name: string;
  @IsIn(DEVICE_TYPES as unknown as string[]) type: string;
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsString() os?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() deploymentDate?: string | null;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {}

export class CreateVmDto {
  @IsUUID() deviceId: string;
  @IsString() @Length(1, 200) name: string;
  @IsOptional() @IsString() ip?: string;
  @IsOptional() @IsString() os?: string;
  @IsOptional() @IsInt() @Min(0) cpu?: number;
  @IsOptional() @IsInt() @Min(0) ramMb?: number;
  @IsOptional() @IsInt() @Min(0) diskGb?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class UpdateVmDto extends PartialType(CreateVmDto) {}

export class CreateCredentialDto {
  @IsOptional() @IsUUID() deviceId?: string;
  @IsOptional() @IsUUID() vmId?: string;
  @IsString() @Length(1, 200) username: string;
  @IsString() password: string;
  @IsIn(CREDENTIAL_TYPES as unknown as string[]) type: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateCredentialDto {
  @IsOptional() @IsString() @Length(1, 200) username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsIn(CREDENTIAL_TYPES as unknown as string[]) type?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ExecDto {
  @IsUUID() credentialId: string;
  @IsString() @Length(1, 4000) command: string;
}

export class CreateSnippetDto {
  @IsUUID() clientId: string;
  @IsUUID() deviceId: string;
  @IsString() @Length(1, 200) name: string;
  @IsString() @MinLength(1) @MaxLength(200000) content: string;
}

export class UpdateSnippetDto {
  @IsOptional() @IsUUID() deviceId?: string;
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200000) content?: string;
}
