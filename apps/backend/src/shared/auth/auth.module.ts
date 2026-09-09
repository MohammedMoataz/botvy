import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { JwtSigner } from './jwt.signer.js';
import { JwtVerifier } from './jwt.verifier.js';
import { WsAuthGuard } from './ws-auth.guard.js';

/**
 * What turns a credential into a principal.
 *
 * Global, because the guards are registered application-wide and Nest resolves
 * their dependencies from wherever they are declared — a guard bound as an
 * `APP_GUARD` in the root module cannot see a provider hidden inside a feature
 * module, which is a failure that only shows up at boot.
 *
 * `ServiceTokenGuard` is deliberately not here: it depends on Identity's
 * service-client port, so it is bound where Identity is, in the module that
 * owns that store.
 */
@Global()
@Module({
  providers: [
    {
      provide: JwtVerifier,
      inject: [ENV],
      useFactory: (env: Env) => new JwtVerifier(env),
    },
    {
      provide: JwtSigner,
      inject: [ENV],
      useFactory: (env: Env) => new JwtSigner(env),
    },
    // The socket handshake authenticates through the same verifier. It was
    // written in P0 and provided by no module at all, which is why the gateway
    // that was also supposed to land in P0 could not have been wired.
    WsAuthGuard,
  ],
  exports: [JwtVerifier, JwtSigner, WsAuthGuard],
})
export class AuthModule {}
