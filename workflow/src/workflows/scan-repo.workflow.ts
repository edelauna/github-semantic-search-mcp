import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { scan } from '../steps/scan.step';

interface WorkflowParams {
}

export class ScanWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {

  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<number> {
    // Run the index activity
    const reposProcessed = await step.do('run index activity', async () => {
      return await scan(this.env)
    });

    return reposProcessed;
  }
}
