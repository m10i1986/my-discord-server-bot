import { REST, Routes } from "discord.js";
import { config } from "./config";
import { anoCommandData } from "./ano";

async function main(): Promise<void> {
    const rest = new REST({ version: "10" }).setToken(config.token);
    const commands = [anoCommandData.toJSON()];

    console.log(`📡 ${commands.length} 件のコマンドを登録中...`);

    if (config.guildId) {
        await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
            body: commands,
        });
        console.log(`✅ ギルドコマンドを登録しました（Guild: ${config.guildId}）`);
    } else {
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        console.log("✅ グローバルコマンドを登録しました（反映まで最大 1 時間かかります）");
    }
}

main().catch(console.error);
