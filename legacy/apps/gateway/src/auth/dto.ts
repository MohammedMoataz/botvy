import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class LoginDto {
  @ApiProperty({
    description:
      'An email, or a bare username for a seeded account such as the default "admin". Registration still requires a real email; this is only what you type to log in.',
  })
  @IsString()
  @MinLength(1)
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'The password being replaced.' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class GoogleSignInDto {
  @ApiProperty({ description: 'Firebase ID token from Google Sign-in in the app' })
  @IsString()
  idToken!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class TokenPairDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;
}
