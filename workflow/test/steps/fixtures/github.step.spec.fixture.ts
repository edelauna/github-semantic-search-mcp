export const fetchTextFixture = () => ({
  repository: {
    batch0: {
      __typename: 'Blob',
      text: 'FROM node:18\n' +
        '# app\n' +
        '##############\n' +
        'WORKDIR /app\n' +
        '\n' +
        'COPY . .\n' +
        'RUN npm install\n' +
        'RUN npm run tsc\n' +
        '\n' +
        '# supervisord\n' +
        '##############\n' +
        'RUN apt-get update && \\\n' +
        '    apt-get install -y --no-install-recommends supervisor\n' +
        '\n' +
        'RUN mv conf/supervisord.conf /etc/supervisord.conf\n' +
        '\n' +
        'CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]\n',
      oid: '50c1e8c007b34cf5ad0ac62047310b59507da70f',
      isBinary: false
    },
    batch1: {
      __typename: 'Blob',
      text: 'Creative Commons Attribution 4.0 International (CC BY-NC-SA 4.0)\n' +
        'Human readable: https://creativecommons.org/licenses/by-nc-sa/4.0/\n' +
        'Legal Code: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode\n' +
        '\n' +
        'You are free to:\n' +
        '\n' +
        '    Share — copy and redistribute the material in any medium or format\n' +
        '\n' +
        '    Adapt — remix, transform, and build upon the material\n' +
        '\n' +
        'The licensor cannot revoke these freedoms as long as you follow the license terms.\n' +
        '\n' +
        'Under the following terms:\n' +
        '\n' +
        'Attribution — You must give appropriate credit, provide a link to the license,\n' +
        'and indicate if changes were made. You may do so in any reasonable manner, but\n' +
        'not in any way that suggests the licensor endorses you or your use.\n' +
        '\n' +
        'NonCommercial — You may not use the material for commercial purposes.\n' +
        '\n' +
        'ShareAlike — If you remix, transform, or build upon the material, you must\n' +
        'distribute your contributions under the same license as the original.\n' +
        '\n' +
        'No additional restrictions — You may not apply legal terms or technological\n' +
        'measures that legally restrict others from doing anything the license permits.\n' +
        '\n' +
        'Notices:\n' +
        '\n' +
        'You do not have to comply with the license for elements of the material in the\n' +
        'public domain or where your use is permitted by an applicable exception or\n' +
        'limitation.\n' +
        '\n' +
        'No warranties are given. The license may not give you all of the permissions\n' +
        'necessary for your intended use. For example, other rights such as publicity,\n' +
        'privacy, or moral rights may limit how you use the material.\n',
      oid: 'c2b4f00ae95a5a454537a7c2b1af76a74ef1b485',
      isBinary: false
    }
  }
})
