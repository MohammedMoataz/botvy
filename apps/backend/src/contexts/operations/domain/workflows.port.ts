/**
 * One automation workflow, as the Owner needs to see it (P10, FR-008).
 *
 * The fields are the four questions somebody asks of a scheduled job: is it
 * switched on, when did it last run, did that run work, and what is it called.
 * Nothing about the workflow's *contents* — the nodes, the credentials, the
 * expressions — because the editor is where those are changed and a portal that
 * showed them would be a second, worse editor.
 */
export interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  /** The last execution's moment, or null when it has never run. */
  lastRunAt: string | null;
  /** `success`, `error`, `running`, or null when it has never run. */
  lastStatus: string | null;
}

/**
 * Automation is not reachable.
 *
 * Its own error rather than a generic one, because the screen has to say
 * *this* — "the automation tool is not answering" — rather than showing an
 * empty list as though the installation had no workflows. An empty list is a
 * statement of fact that would be false, and the Owner would go looking for
 * workflows they had already imported.
 */
export class AutomationUnreachable extends Error {
  constructor(readonly detail: string) {
    super(`the automation tool is not answering: ${detail}`);
    this.name = 'AutomationUnreachable';
  }
}

/** Automation has no credential configured on this installation. */
export class AutomationNotConfigured extends Error {
  constructor() {
    super('no automation API key is configured on this installation');
    this.name = 'AutomationNotConfigured';
  }
}

/**
 * What the portal can do to the automation tool (FR-008).
 *
 * Four verbs and no more. Creating, editing and deleting a workflow are the
 * editor's, deliberately: the portal's job is to answer "is my automation
 * running", and a console that could rewrite a workflow would be a second place
 * the definition lives — with n8n's own editor as the other, and no way to tell
 * which one last won.
 *
 * Declared here because Operations is the context that answers for the
 * installation's health, and bound in its own `infrastructure/` to whatever
 * automation this deployment runs. The blueprint fixes that as n8n; the port is
 * what keeps a second one from being a change to a controller.
 */
export abstract class WorkflowsPort {
  abstract list(): Promise<WorkflowSummary[]>;
  abstract activate(id: string): Promise<void>;
  abstract deactivate(id: string): Promise<void>;
  /** Run it now. Answers the execution id, when the tool gives one. */
  abstract run(id: string): Promise<{ executionId: string | null }>;
}
