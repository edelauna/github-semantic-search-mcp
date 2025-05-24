import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { doEmbeddings } from '../steps/embed.step';

interface WorkflowParams {
  owner: string,
  repo: string,
}

export class EmbedWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {

  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<void> {
    const { owner, repo } = event.payload

    await step.do('run embed activity', async () => await doEmbeddings(this.env, owner, repo))
  }
}
