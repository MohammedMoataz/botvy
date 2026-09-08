import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { CurrentPrincipal, Public, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import {
  ChangePasswordHandler,
  CurrentPasswordWrong,
  MIN_PASSWORD_LENGTH,
  NewPasswordTooShort,
  NewPasswordUnchanged,
} from '../change-password/change-password.handler.js';
import { InvalidCredentials, SignInHandler, type SignedIn } from './sign-in.handler.js';

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
 * Sign in, and change your own password.
 *
 * These two exist together on purpose. The administrator seed has warned on
 * every boot since this phase began that the Owner should change the default
 * password at `POST /api/v1/auth/password` — an endpoint that did not exist,
 * reachable only with a token that could not be obtained. Either both are here
 * or neither is worth having.
 *
 * Registration, Google sign-in and refresh-token rotation are still P1's. This
 * is the credential path for the seeded account, not an auth system.
 */
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly signIn: SignInHandler,
    private readonly changePassword: ChangePasswordHandler,
  ) {}

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
