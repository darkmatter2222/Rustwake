import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins:[react()],
  base:"/rustwake/",
  server:{host:"0.0.0.0",port:5173},
  build:{outDir:"dist",emptyOutDir:true,target:"es2022",cssCodeSplit:true},
  define:{"__RUSTWAKE_V2__":JSON.stringify(true)}
});
