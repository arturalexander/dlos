const fs = require('fs');
const content = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;`;

fs.writeFileSync('next.config.ts', content, { encoding: 'ascii' });
console.log('Fixed next.config.ts');
