import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { GoogleAuthService } from './google-auth.service.js';
import { GoogleSignInDto, LoginDto, RefreshDto, RegisterDto, TokenPairDto } from './dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleAuthService,
  ) {}

  /**
   * Exchanges a Google Sign-in token for this gateway's own token pair.
   * Google proves identity; the account and everything it owns stay in
   * Postgres, and every later request is authorised by our JWT as usual.
   */
  @Public()
  @Post('google')
  @ApiOkResponse({ type: TokenPairDto })
  async google_(@Body() dto: GoogleSignInDto) {
    const verified = await this.google.verify(dto.idToken);
    const user = await this.google.findOrCreateUser(verified);
    return this.auth.issueForUser(user.id, user.role);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOkResponse({ type: TokenPairDto })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}
