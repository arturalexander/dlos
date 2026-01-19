/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'storage.googleapis.com',
                pathname: '/dlos-ai.firebasestorage.app/**',
            },
            {
                protocol: 'https',
                hostname: 'firebasestorage.googleapis.com',
                pathname: '/**',
            },
        ],
    },
};

module.exports = nextConfig;