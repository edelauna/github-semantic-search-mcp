import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
	// Read all migrations in the `migrations` directory
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	const key = await crypto.subtle.generateKey(
		{
			name: 'RSA-OAEP',
			modulusLength: 2048, // Or a different size
			publicExponent: new Uint8Array([1, 0, 1]), // Equivalent to 65537
			hash: 'SHA-256', // Specify the hash algorithm
		},
		true, // extractable
		['encrypt', 'decrypt']
	) as CryptoKeyPair

	return {
		test: {
			setupFiles: ["./test/setup.ts"],
			poolOptions: {
				workers: {
					isolatedStorage: false,
					singleWorker: true,
					wrangler: { configPath: './wrangler.toml' },
					miniflare: {
						bindings: {
							// Add a test-only binding for migrations, so we can apply them in a setup file
							TEST_MIGRATIONS: migrations,
							// Generating a key for tests
							RSA_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', key.privateKey))
						},
					},
				},
			},
		},
	}
})
