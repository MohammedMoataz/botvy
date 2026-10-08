import {
  Args,
  Field,
  Float,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { LinkPreviewQueryHandler } from './link-preview.query.js';

@ObjectType('LinkPreviewPlace')
export class LinkPreviewPlaceType {
  @Field(() => Float)
  lat!: number;

  @Field(() => Float)
  lng!: number;

  @Field(() => String, { nullable: true })
  label!: string | null;
}

/**
 * What a meeting's link or address is, before it is opened (032, US2).
 * Every field nullable: a page may give a title and no picture, a map link
 * only a place.
 */
@ObjectType('LinkPreview')
export class LinkPreviewType {
  @Field(() => String, { nullable: true })
  url!: string | null;

  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field(() => String, { nullable: true })
  siteName!: string | null;

  @Field(() => String, { nullable: true })
  image!: string | null;

  @Field(() => LinkPreviewPlaceType, { nullable: true })
  place!: LinkPreviewPlaceType | null;
}

/**
 * `linkPreview(url, address)`, for a signed-in member. Null when there is
 * nothing to show, which includes offline sources and a geocoder switched
 * off: a client then shows the plain link, as it would offline.
 */
@Resolver()
@UsersOnly()
export class LinkPreviewResolver {
  constructor(private readonly previews: LinkPreviewQueryHandler) {}

  @Query(() => LinkPreviewType, { name: 'linkPreview', nullable: true })
  async linkPreview(
    @CurrentPrincipal() principal: Principal,
    @Args('url', { type: () => String, nullable: true }) url: string | null,
    @Args('address', { type: () => String, nullable: true })
    address: string | null,
  ): Promise<LinkPreviewType | null> {
    return this.previews.preview(principal.id, { url, address });
  }
}
