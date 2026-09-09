import { Args, Field, ID, ObjectType, Query, Resolver, registerEnumType } from '@nestjs/graphql';
import { CurrentPrincipal, Roles, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { DateTimeScalar } from '../../../../graphql/scalars.js';
import { DevicesQueryHandler, type DeviceView } from './devices.query.js';

export enum DeviceKind {
  android = 'android',
  ios = 'ios',
  chrome_extension = 'chrome_extension',
  web = 'web',
}
registerEnumType(DeviceKind, { name: 'DeviceKind' });

/**
 * A registered installation.
 *
 * `hasPush` rather than the token. Whether a device can be reached is what a
 * client needs to render "notifications are off on this phone"; the token itself
 * is a credential for somebody else's service, and a read edge that hands it out
 * has published it to every browser extension the member has installed.
 */
@ObjectType('Device')
export class DeviceType {
  @Field(() => ID)
  id!: string;

  @Field(() => DeviceKind)
  kind!: DeviceKind;

  @Field()
  hasPush!: boolean;

  @Field(() => DateTimeScalar, { nullable: true })
  lastSeenAt!: Date | null;
}

function toDeviceType(view: DeviceView): DeviceType {
  return {
    id: view.deviceId,
    kind: view.kind as DeviceKind,
    hasPush: view.pushToken !== null,
    lastSeenAt: view.lastSeenAt,
  };
}

@Resolver(() => DeviceType)
export class MyDevicesResolver {
  constructor(private readonly devices: DevicesQueryHandler) {}

  @Query(() => [DeviceType], { description: "The caller's own registered devices." })
  @UsersOnly()
  async myDevices(@CurrentPrincipal() principal: Principal): Promise<DeviceType[]> {
    return (await this.devices.forUser(principal.id)).map(toDeviceType);
  }

  /**
   * Any member's devices, for the admin portal's Users table.
   *
   * Scoped by argument rather than by principal, which is exactly why it is
   * admin-only: `myDevices` above cannot be asked about somebody else, and this
   * one can.
   */
  @Query(() => [DeviceType], { description: "A member's devices. Administrators only." })
  @UsersOnly()
  @Roles('admin')
  async devicesOf(@Args('userId', { type: () => ID }) userId: string): Promise<DeviceType[]> {
    return (await this.devices.forUser(userId)).map(toDeviceType);
  }
}
