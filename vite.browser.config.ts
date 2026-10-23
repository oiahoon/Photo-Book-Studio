import { defineConfig } from 'vite';
export default defineConfig({root:'apps/browser',base:'./',build:{outDir:'../../dist-browser',emptyOutDir:true},server:{host:'127.0.0.1',port:4318,strictPort:true}});
