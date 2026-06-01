/** @type {import('pm2').StartOptions[]} */
const apps = [
    {
        name: "anonymous",
        script: "node",
        args: "dist/index.js",
        cwd: "./anonymous",
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: "128M",
        // ファイルログ無効 (journald へ出力: pm2 install pm2-journald)
        disable_logs: true,
        env: {
            NODE_ENV: "production",
        },
    },
];

module.exports = { apps };
