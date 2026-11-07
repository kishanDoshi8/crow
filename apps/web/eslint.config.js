import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["dist/**", "build/**", "coverage/**", "node_modules/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["src/**/*.{ts,tsx}"],
		languageOptions: {
			globals: globals.browser,
		},
		plugins: {
			import: importPlugin,
			"unused-imports": unusedImports,
		},
		settings: {
			"import/parsers": {
				"@typescript-eslint/parser": [".ts", ".tsx"],
			},
			"import/resolver": {
				typescript: {
					project: "./tsconfig.json",
				},
			},
		},
		rules: {
			// Debug logging stays out of production; warnings and errors are fine.
			"no-console": ["error", { allow: ["warn", "error"] }],
			"import/first": "error",
			"import/newline-after-import": "error",
			"import/no-cycle": "error",
			"import/no-useless-path-segments": [
				"error",
				{ noUselessIndex: true },
			],
			"import/no-duplicates": "off",
			"no-duplicate-imports": "off",
			// Type-only imports are erased at build time, so they can't form
			// runtime cycles; this keeps them marked as such.
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{ fixStyle: "separate-type-imports" },
			],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"unused-imports/no-unused-imports": "error",
			"unused-imports/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["src/app/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"@/features/*/components/*",
								"@/features/*/hooks/*",
								"@/features/*/context/*",
								"@/features/*/lib/*",
								"@/features/*/types/*",
								"@/features/*/controls/*",
								"@/features/*/widgets/*",
								"@/features/*/predictions/*",
							],
							message:
								"Import from a feature public API (`@/features/<feature>`) or page entrypoint (`@/features/<feature>/pages/*`).",
						},
					],
				},
			],
		},
	},
);
