import type { Client } from "discord.js";
import { pruneOldLogs } from "../services/database";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function onReady(client: Client<true>): void {
    console.log(`✅ ${client.user.tag} としてログインしました`);

    const pruned = pruneOldLogs();
    if (pruned > 0) console.log(`🗑️  ${pruned} 件の古いログを削除しました`);

    setInterval(() => {
        const count = pruneOldLogs();
        if (count > 0) console.log(`🗑️  [定期] ${count} 件の古いログを削除しました`);
    }, ONE_DAY_MS);
}
