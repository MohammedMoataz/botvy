import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { loadPrompt } from '../llm/prompts.js';

const PROGRAM_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    exercises: { type: 'array', items: { type: 'string' } },
    muscleGroups: { type: 'array', items: { type: 'string' } },
  },
  required: ['message', 'exercises', 'muscleGroups'],
  additionalProperties: false,
} as const;

interface GeneratedProgram {
  message: string;
  exercises: string[];
  muscleGroups: string[];
}

export interface ProfileForPrompt {
  weightKg?: number | null;
  heightCm?: number | null;
  goal?: string | null;
  experience?: string | null;
  likedFoods?: string[];
  dislikedFoods?: string[];
  allergies?: string[];
  gymTime?: string | null;
}

/**
 * Turns a user's profile and recent history into a day's workout and meal
 * plan. Isolated from NightlyService so the scheduling, safety and
 * persistence rules around it stay testable without a model.
 */
@Injectable()
export class ProgramGenerator {
  private readonly logger = new Logger(ProgramGenerator.name);

  constructor(private readonly llm: LlmService) {}

  async generate(input: {
    userId: string;
    avoidMuscleGroups: string[];
    profile: unknown;
  }): Promise<{ text: string; exercises: string[]; muscleGroups: string[] } | null> {
    const profile = (input.profile ?? {}) as ProfileForPrompt;

    const prompt = loadPrompt('program.md', {
      goal: profile.goal ?? 'general fitness',
      experience: profile.experience ?? 'unspecified',
      weight: profile.weightKg ? `${profile.weightKg} kg` : 'unknown',
      height: profile.heightCm ? `${profile.heightCm} cm` : 'unknown',
      liked: (profile.likedFoods ?? []).join(', ') || 'none stated',
      disliked: (profile.dislikedFoods ?? []).join(', ') || 'none stated',
      allergies: (profile.allergies ?? []).join(', ') || 'none stated',
      avoid: input.avoidMuscleGroups.join(', ') || 'nothing in particular',
      gymTime: profile.gymTime ?? 'unspecified',
    });

    const result = await this.llm.extract<GeneratedProgram>({
      messages: [{ role: 'user', content: prompt }],
      schemaName: 'daily_program',
      schema: PROGRAM_SCHEMA,
    });

    if (!result) {
      // Nothing is sent rather than sending something unstructured: the
      // caller withholds on null, which is safer than delivering a plan
      // whose allergen content could not be checked field by field.
      this.logger.warn(`program generation failed for ${input.userId}; nothing will be sent`);
      return null;
    }

    return {
      text: result.message,
      exercises: result.exercises ?? [],
      muscleGroups: result.muscleGroups ?? [],
    };
  }
}
