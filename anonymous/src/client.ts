import { Client, GatewayIntentBits } from "discord.js";
import type { PendingPost } from "./types/index";

export class BotClient extends Client {
    public readonly pendingPosts = new Map<string, PendingPost>();

    constructor() {
        super({
            intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
        });
    }
}
