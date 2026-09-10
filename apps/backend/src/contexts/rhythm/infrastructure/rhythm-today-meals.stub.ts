import { Injectable } from '@nestjs/common';
import { TodayMealsPort } from '../domain/rhythm.ports.js';

/**
 * The plan's meal line — **stubbed until P8 (Nutrition)**.
 *
 * P8 owns meals and replaces this binding with an adapter over its own
 * `TodayMealsQuery`; one line in `rhythm.module.ts` and nothing else in the
 * rhythm moves. The reasoning is the same as `rhythm-next-session.stub.ts`, at
 * length there: a branch in the tick asking whether Nutrition exists would
 * outlive the phase that made it true, would ask a boot-time constant once per
 * member per pass, and would be a second place holding the knowledge that the
 * plan reads correctly without a meal line.
 *
 * One thing is specific to this port. The meal line is the only part of a plan
 * that comes from the language model (blueprint III: local-first LLM), so
 * `null` here is not only "Nutrition is not built yet" — it is also the shape
 * of "the model was unavailable this evening", which stays true after P8 lands.
 * The rhythm therefore has to tolerate a missing meal line permanently, and
 * `DailyPlan.setMealLine(null, at)` exists for exactly that. A stub that threw,
 * or one that returned a placeholder sentence, would let the caller be written
 * as though the line always arrives — and the first evening Ollama was down the
 * member would read a plan with a fabricated meal in it.
 */
@Injectable()
export class NoMealsYet extends TodayMealsPort {
  async lineFor(_userId: string, _date: string): Promise<string | null> {
    return null;
  }
}
