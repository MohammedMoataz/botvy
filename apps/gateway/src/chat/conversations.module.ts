import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service.js';

/**
 * No controller. Conversations are mutated through the outbox in `/sync`, and
 * read by ChatService, NightlyService and SyncService — three importers, which
 * is why this is its own module rather than part of ChatService (CoachingModule
 * needs it, and ChatModule already imports CoachingModule).
 */
@Module({
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
