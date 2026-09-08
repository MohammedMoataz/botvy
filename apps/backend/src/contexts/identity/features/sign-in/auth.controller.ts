import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentPrincipal, Public, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import {
  ChangePasswordHandler,
  CurrentPasswordWrong,
  MIN_PASSWORD_LENGTH,
  NewPasswordTooShort,
  NewPasswordUnchanged,
} from '../change-password/change-password.handler.js';
import {
  RefreshHandler,
  RefreshRejected,
  type IssuedSession,
} from '../refresh/refresh.handler.js';
import {
  EmailAlreadyRegistered,
  PasswordTooShort,
  PasswordsDoNotMatch,
  RegisterHandler,
  RegistrationClosed,
  type Registered,
} from '../register/register.handler.js';
import { InvalidCredentials, SignInHandler, type SignedIn } from './sign-in.handler.js';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  password!: string;

  // Checked against `password` in the handler, not here. A class-validator rule
  // cannot see a sibling field without a custom decorator, and the rule belongs
  // with the others anyway.
  @IsString()
  passwordConfirm!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class SignInDto {
  @IsEmail()
  email!: string;

  // No length rule on the way in. An existing password shorter than today's
  // minimum still has to be able to sign in, precisely so its owner can reach
  // the endpoint below and replace it.
  @IsString()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  newPassword!: string;
}

/**
 * The credential surface: register, sign in, refresh, change your password.
 *
 * Sign-in and password change landed together in P0, because the administrator
 * seed had been warning on every boot that the Owner should change the default
 * password at an endpoint that did not exist and could not have been reached.
 * P1 adds registration and refresh around them.
 *
 * Google sign-in and account deletion are still ahead. Each failure mode gets
 * its own status rather than one flat 400 — a closed registration, a taken
 * email and a mistyped confirmation are three different things for a client to
 * show a person.
 */
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly signIn: SignInHandler,
    private readonly changePassword: ChangePasswordHandler,
    private readonly registerMember: RegisterHandler,
    private readonly refreshSession: RefreshHandler,
  ) {}

  @Post('register')
  @Public()
  async register(@Body() body: RegisterDto): Promise<Registered> {
    try {
      return await this.registerMember.handle(body);
    } catch (error) {
      // Each of these is a different thing for a client to show, so each gets
      // its own status rather than one flat 400.
      if (error instanceof RegistrationClosed) throw new ForbiddenException(error.message);
      if (error instanceof EmailAlreadyRegistered) throw new ConflictException(error.message);
      if (error instanceof PasswordsDoNotMatch || error instanceof PasswordTooShort) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  async login(@Body() body: SignInDto): Promise<SignedIn> {
    try {
      return await this.signIn.handle(body);
    } catch (error) {
      if (error instanceof InvalidCredentials) throw new UnauthorizedException(error.message);
      throw error;
    }
  }

  /**
   * Public, because the access token it replaces has by definition expired. The
   * refresh token is the credential here, and it is checked against the store
   * rather than verified as a signature.
   */
  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(@Body() body: RefreshDto): Promise<IssuedSession> {
    try {
      return await this.refreshSession.handle(body.refreshToken);
    } catch (error) {
      if (error instanceof RefreshRejected) {
        // The code matters to the client: `token_expired` means sign in again,
        // and `session_replay` means the session was ended on purpose and
        // something is wrong. Flattening both to 401 loses that.
        throw new UnauthorizedException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  @Post('password')
  @UsersOnly()
  @ApiBearerAuth()
  @HttpCode(200)
  async password(
    @Body() body: ChangePasswordDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ changed: true }> {
    try {
      return await this.changePassword.handle({ userId: principal.id, ...body });
    } catch (error) {
      // The current password being wrong is a 401, not a 400: it is a failed
      // credential check, and a client that treats it as a validation error
      // shows the member the wrong message.
      if (error instanceof CurrentPasswordWrong) throw new UnauthorizedException(error.message);
      if (error instanceof NewPasswordTooShort || error instanceof NewPasswordUnchanged) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
