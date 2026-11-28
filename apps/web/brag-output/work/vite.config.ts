import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const web = path.resolve(__dirname, "../..");

export default defineConfig({
	root: __dirname,
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "@": path.join(web, "src") } },
	server: { port: 5199, strictPort: true, fs: { allow: [path.resolve(web, "../..")] } },
});
