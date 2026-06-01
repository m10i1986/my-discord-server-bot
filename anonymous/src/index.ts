import { Events } from 'discord.js';
import { config } from './config';
import { BotClient } from './client';
import { onReady } from './events/ready';
import { onInteractionCreate } from './events/interactionCreate';

async function main(): Promise<void> {
    const client = new BotClient();

    client.once(Events.ClientReady, onReady);
    client.on(Events.InteractionCreate, (interaction) => {
        void onInteractionCreate(interaction);
    });

    await client.login(config.token);
}

main().catch(console.error);
