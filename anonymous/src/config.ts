import * as path from 'path';
import * as dotenv from 'dotenv';

// Bot ディレクトリの .env を読み込む (dist/ の1階層上)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'] as const;
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`環境変数 ${envVar} が設定されていません`);
    }
}

export const config = {
    token: process.env.DISCORD_TOKEN as string,
    clientId: process.env.DISCORD_CLIENT_ID as string,
    guildId: process.env.DISCORD_GUILD_ID,
} as const;
