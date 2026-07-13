import { rm } from 'node:fs/promises';

await Promise.all([
  rm(new URL('../apps/api/dist', import.meta.url), { recursive: true, force: true }),
  rm(new URL('../apps/web/dist', import.meta.url), { recursive: true, force: true }),
]);

console.log('Removed apps/api/dist and apps/web/dist.');
