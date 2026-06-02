import { type Interaction } from "discord.js";
import type { BotClient } from "../client";
import { executeAno, executeAnoFromModal } from "../ano";
import { recordConsent } from "../services/database";
import { resolveSendableChannel, sendAnonymousPost } from "../services/anonymousPost";

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
    const client = interaction.client as BotClient;

    // ── スラッシュコマンド ──────────────────────────────────────
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== "ano") return;
        try {
            await executeAno(interaction);
        } catch (error) {
            console.error("[/ano error]:", error);
            const reply = { content: "コマンドの実行中にエラーが発生しました。", ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
        return;
    }

    // ── モーダル ──────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
        if (interaction.customId !== "ano_modal") return;
        try {
            await executeAnoFromModal(interaction);
        } catch (error) {
            console.error("[/ano modal error]:", error);
            const reply = { content: "コマンドの実行中にエラーが発生しました。", ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
        return;
    }

    // ── ボタン ──────────────────────────────────────────────────
    if (!interaction.isButton()) return;

    const colonIdx = interaction.customId.indexOf(":");
    if (colonIdx === -1) return;

    const action = interaction.customId.slice(0, colonIdx);
    const nonce = interaction.customId.slice(colonIdx + 1);

    if (action !== "ano_confirm" && action !== "ano_cancel") return;

    console.log(
        `[btn] action=${action} nonce=${nonce} userId=${interaction.user.id} mapSize=${client.pendingPosts.size}`,
    );

    const pending = client.pendingPosts.get(nonce);
    console.log(
        `[btn] pending found=${pending !== undefined}${pending ? ` expiresAt=${pending.expiresAt} now=${Date.now()} ttlLeft=${pending.expiresAt - Date.now()}ms` : ""}`,
    );

    if (!pending) {
        await interaction.update({
            content: "⚠️ この操作は期限切れです。もう一度 `/ano` を実行してください。",
            components: [],
        });
        return;
    }

    if (pending.userId !== interaction.user.id) {
        await interaction.reply({
            content: "この操作はあなた宛てではありません。",
            ephemeral: true,
        });
        return;
    }

    if (Date.now() > pending.expiresAt) {
        client.pendingPosts.delete(nonce);
        await interaction.update({
            content:
                "⏱️ 操作が 有効期限内に完了しませんでした。もう一度 `/ano` を実行してください。",
            components: [],
        });
        return;
    }

    client.pendingPosts.delete(nonce);

    if (action === "ano_cancel") {
        await interaction.update({ content: "❌ 投稿をキャンセルしました。", components: [] });
        return;
    }

    recordConsent(pending.userId);

    const channel = await resolveSendableChannel(client, pending.channelId, interaction.channel);
    console.log(
        `[btn] resolveSendableChannel channelId=${pending.channelId} result=${channel ? channel.id : "null"}`,
    );
    if (!channel) {
        await interaction.update({
            content:
                "⚠️ このチャンネルへ投稿できません。ボットに **チャンネルを見る** と **メッセージを送信** 権限を付与してください。",
            components: [],
        });
        return;
    }

    try {
        console.log(`[btn] calling sendAnonymousPost channelId=${channel.id}`);
        await sendAnonymousPost(channel, pending);
        await interaction.update({ content: "✅ 匿名メッセージを投稿しました！", components: [] });
    } catch (error) {
        console.error("[anonymousPost error]:", error);
        await interaction.update({
            content: "⚠️ 投稿に失敗しました。ボットの「メッセージを送信」権限を確認してください。",
            components: [],
        });
    }
}
