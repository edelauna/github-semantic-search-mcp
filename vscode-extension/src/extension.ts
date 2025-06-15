import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const didChangeEmitter = new vscode.EventEmitter<void>();

  context.subscriptions.push(vscode.lm.registerMcpServerDefinitionProvider('github-semantic-search-server', {
    onDidChangeMcpServerDefinitions: didChangeEmitter.event,
    provideMcpServerDefinitions: async () =>
      [new vscode.McpHttpServerDefinition(
        'github-semantic-search-server',
        vscode.Uri.parse('https://github-search.lokeel.com/mcp'),
      )],
    resolveMcpServerDefinition: async (server: vscode.McpHttpServerDefinition) => {
      const { accessToken } = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
      if (!accessToken) {
        return undefined
      }

      server.headers['GITHUB_TOKEN'] = accessToken;
      return server;
    }
  }));
}
