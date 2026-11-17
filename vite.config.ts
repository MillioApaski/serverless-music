import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApi } from './scripts/dev-adapter';
export default defineConfig({plugins:[react(),localApi()],root:'apps/web',build:{outDir:'../../dist/client',emptyOutDir:true},worker:{format:'es'},server:{allowedHosts:true}});
