import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CurrentPrincipal, Scopes, ServiceOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { PushService } from '../../../../shared/push/push.service.js';
import { AuditPort } from '../../domain/audit.port.js';
import { ADMIN_DEVICE_LOOKUP } from '../../infrastructure/admin-device.lookup.js';
import { InternalAlertsHandler, type AdminDeviceLookup } from './internal-alerts.handler.js';

export class InternalAlertDto {
  @IsString()
  workflow!: string;

  @IsString()
  error!: string;

  @IsOptional()
  @IsString()
  executionId?: string;
}

/**
 * Where n8n's error workflow lands. A service route: the token is checked by
 * the ServiceTokenGuard, the kind and the scope by the KindGuard, and a member
 * JWT is refused before the handler ever runs.
 */
@Controller('internal/alerts')
@ServiceOnly()
@Scopes('internal:alerts')
@ApiSecurity('service-token')
export class InternalAlertsController {
  constructor(
    @Inject(ADMIN_DEVICE_LOOKUP) private readonly devices: AdminDeviceLookup,
    private readonly push: PushService,
    private readonly audit: AuditPort,
  ) {}

  @Post()
  async alert(
    @Body() body: InternalAlertDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ notified: number }> {
    // The handler carries the principal so the audit row names who raised the
    // alert; one instance per request is the honest way to give it that.
    return new InternalAlertsHandler(this.devices, this.push, this.audit, principal).handle(body);
  }
}
