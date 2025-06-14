import { defineRocketConfig } from 'config-rocket'

export default defineRocketConfig({
  parameters: [
    {
      id: '$input-GITHUB_TOKEN',
      resolver: {
        operation: 'prompt',
        label: 'Please enter your Github Personal Access Token',
        type: 'text',
      },
    },
  ],

  variablesResolver: {
    '{{GITHUB_TOKEN}}': '$input-GITHUB_TOKEN',
  },

  filesBuildResolver: {
    'github-semantic-search-server-mcp': {
      filePath: '.roo/mcp.json',
      content: 'fuel:github-semantic-search-server-mcp.json',
    },
  },
})
