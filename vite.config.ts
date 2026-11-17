import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApi } from './scripts/dev-adapter';
export default defineConfig({plugins:[react(),localApi()],root:'apps/web',build:{outDir:'../../dist/client',emptyOutDir:true},worker:{format:'es'},optimizeDeps:{include:['quickjs-emscripten-core','@jitl/quickjs-wasmfile-release-sync','@jitl/quickjs-wasmfile-release-sync/ffi','@jitl/quickjs-wasmfile-release-sync/emscripten-module']},server:{allowedHosts:true}});
