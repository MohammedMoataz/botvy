import { Module } from '@nestjs/common';
import { IdentityModule } from '../contexts/identity/identity.module.js';
import { AuthModule } from '../shared/auth/auth.module.js';
import { NudgeService } from './nudge.service.js';
import { SocketGateway } from './socket.gateway.js';

/**
 * The socket, in the backend role only.
 *
 * `NudgeService` was written in P0 and provided by nobody, so `attached` was
 * false everywhere and every nudge went nowhere — there was no gateway to
 * attach a server to it. It lives here rather than in `PlatformModule` because
 * the worker has no consumer of it yet; when a worker job needs to nudge, it
 * moves up and this module keeps only the gateway.
 *
 * `IdentityModule` for `RegisterDeviceHandler`: a connecting socket stamps its
 * install as seen, which is the flag the alert sweep reads to decide whether a
 * device has already scheduled its own alarms.
 */
@Module({
  imports: [AuthModule, IdentityModule],
  providers: [NudgeService, SocketGateway],
  exports: [NudgeService],
})
export class WsModule {}
