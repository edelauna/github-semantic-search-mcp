import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface WorkflowParams {
}

export class EmbedWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {

  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<number> {
    // Run the index activity
    const reposProcessed = await step.do('run index activity', async () => {
      return 1 // indexActivities.run();
    });

    return reposProcessed;
  }
}
