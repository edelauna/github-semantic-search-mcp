import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
	// Read all migrations in the `migrations` directory
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);
	return {
		test: {
			setupFiles: ["./test/setup.ts"],
			poolOptions: {
				workers: {
					isolatedStorage: false,
					singleWorker: true,
					wrangler: { configPath: './wrangler.toml' },
					miniflare: {
						// Add a test-only binding for migrations, so we can apply them in a setup file
						bindings: { TEST_MIGRATIONS: migrations },
					},
				},
			},
		},
	}
})
