import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { verifyMediaUrl } from '../media/media.signing.js';
import { StorageProvider } from './storage.provider.js';

/** The response methods this route uses; the same subset the media proxy takes. */
type HttpResponse = {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): HttpResponse;
  end(body?: Buffer): void;
};

/**
 * Attachment keys carry a content hash, so a changed file is a new key and a
 * cached copy is never a stale one — served for a year, immutable.
 */
const CACHE_SECONDS = 31_536_000;

/** By extension: every key is minted by an adapter that chose the format. */
const TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

/**
 * Serves a file the filesystem storage provider holds (`GET /media/files`).
 *
 * Public for the reason the image proxy is: an `<img>` cannot send a bearer
 * token and never passes through the refresh interceptor. The signature over
 * the key is the whole authorisation — a URL nobody could have minted without
 * `MEDIA_SIGNING_SECRET` — and a wrong one is a bad request rather than a
 * forbidden, so a prober learns nothing about which keys exist.
 *
 * Declared in `AppModule` like every controller, so the worker can import the
 * storage module without gaining an HTTP surface.
 */
@Controller('media/files')
export class LocalFilesController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageProvider,
  ) {}

  @Get()
  @Public()
  async serve(
    @Query('key') key: string,
    @Query('sig') signature: string,
    @Res() response: HttpResponse,
  ): Promise<void> {
    if (!key || !signature) {
      throw new BadRequestException('a file needs key and sig');
    }
    if (!verifyMediaUrl(key, signature, this.env.MEDIA_SIGNING_SECRET)) {
      throw new BadRequestException('bad signature');
    }

    const bytes = await this.storage.read(key);
    if (!bytes) throw new NotFoundException('no such file');

    const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
    response.setHeader(
      'content-type',
      TYPES[extension] ?? 'application/octet-stream',
    );
    response.setHeader(
      'cache-control',
      `private, max-age=${CACHE_SECONDS}, immutable`,
    );
    response.status(200).end(bytes);
  }
}
