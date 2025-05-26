import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { indexStep } from '../steps/index.step';

export interface IndexWorkflowParams {
  owner: string,
  repo: string,
  githubTokenRef: string,
  pathMap: { [keyof: string]: string }
}

export class IndexWorkflow extends WorkflowEntrypoint<Env, IndexWorkflowParams> {

  async run(event: WorkflowEvent<IndexWorkflowParams>, step: WorkflowStep): Promise<number> {
    // Run the index activity
    const filesProcessed = await step.do('run index activity', async () => {
      return await indexStep(this.env, this.ctx, event)
    });

    return filesProcessed;
  }
}
