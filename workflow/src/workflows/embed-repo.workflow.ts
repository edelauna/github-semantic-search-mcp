import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { doEmbeddings } from '../steps/embed.step';

export interface EmbedWorkflowParams {
  owner: string,
  repo: string,
  githubTokenRef: string,
  idIndex: number,
  parentId: string | null
}

export class EmbedWorkflow extends WorkflowEntrypoint<Env, EmbedWorkflowParams> {

  async run(event: WorkflowEvent<EmbedWorkflowParams>, step: WorkflowStep): Promise<void> {

    const hasMore = await step.do('run embed activity', async () => await doEmbeddings(this.env, event.payload, event.instanceId))

    if (hasMore) {
      await step.waitForEvent('embeddings-complete', { type: 'embeddings-complete' })
    }
  }
}
