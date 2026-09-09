import { Field, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Roles, UsersOnly } from '../../../../shared/auth/decorators.js';
import { JSONScalar } from '../../../../graphql/scalars.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';

/**
 * One key of the registry.
 *
 * `value` and `default` are both `JSON`, because the registry holds times,
 * numbers, booleans, string lists and an object of quiet hours. A union of every
 * shape would be a second copy of forty-one zod schemas whose only job is to
 * describe what the registry already describes.
 *
 * `readOnly` is the registry entry's own flag rather than anything derived from
 * the key's prefix. Refusing `ops.*` wholesale is what once froze
 * `ops.staleAfterMinutes`, which is the number an operator most wants to retune.
 */
@ObjectType('Setting')
export class SettingType {
  @Field()
  key!: string;

  @Field(() => JSONScalar, { nullable: true })
  value!: unknown;

  @Field(() => JSONScalar, { nullable: true, name: 'defaultValue' })
  default!: unknown;

  @Field()
  description!: string;

  @Field()
  readOnly!: boolean;
}

/**
 * The registry, read.
 *
 * Writing it stays on `PATCH /api/v1/admin/settings/:key`: changing an operator
 * knob is a command, and constitution X puts commands on REST. This is the read
 * half the portal's table renders, and it is admin-only because the registry
 * holds the installation's own tuning, not a member's.
 */
@Resolver(() => SettingType)
export class AdminSettingsResolver {
  constructor(private readonly settings: SettingsService) {}

  @Query(() => [SettingType], {
    name: 'settings',
    description: 'The settings registry. Administrators only.',
  })
  @UsersOnly()
  @Roles('admin')
  async registry(): Promise<SettingType[]> {
    return (await this.settings.describe()) as SettingType[];
  }
}
