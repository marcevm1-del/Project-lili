import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    // The manifest says minSdkVersion 23 — Android 6. Vite's default target is
    // ES2020, so the bundle shipped optional chaining and nullish coalescing:
    // syntax a WebView from that era cannot parse, producing a white screen
    // rather than an error anyone could report. Transpiling down costs a few
    // kilobytes and makes the app run on the devices it claims to support.
    target: ["es2015", "chrome58", "safari11"],
    // v2.9.1 — React in its own chunk.
    //
    // Before this the whole app was one 510 KB file, so shipping a copy change
    // made every returning user re-download React as well. React does not
    // change between our releases; the app changes weekly during a beta. This
    // is the difference between a 400 KB update and a 30 KB one, on the mobile
    // data this app is used over.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
