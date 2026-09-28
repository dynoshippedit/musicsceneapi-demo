module.exports = {
    apps: [{
        name: 'pulsegrid-api',
        script: './server.js',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        restart_delay: 3000,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'development'
        },
        env_production: {
            NODE_ENV: 'production'
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        time: true
    }]
};
