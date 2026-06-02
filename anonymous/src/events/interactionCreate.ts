import { type Interaction } from "discord.js";
import type { BotClient } from "../client";
import { executeAno, executeAnoFromModal } from "../ano";
import { recordConsent } from "../services/database";
import { sendAnonymousPost } from "../services/anonymousPost";

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

    const pending = client.pendingPosts.get(nonce);

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
            content: "⏱️ 操作が 10 分以内に完了しませんでした。もう一度 `/ano` を実行してください。",
            components: [],
        });
        return;
    }

    client.pendingPosts.delete(nonce);

    if (action === "ano_cancel") {
        await interaction.update({ content: "❌ 投稿をキャンセルしました。", components: [] });
        return;
    }

    try {
        recordConsent(pending.userId);
        const channel = interaction.channel;
        if (!channel || !channel.isSendable()) {
            await interaction.update({
                content: "⚠️ このチャンネルへの書き込み権限がありません。",
                components: [],
            });
            return;
        }
        await sendAnonymousPost(channel, pending);
        await interaction.update({ content: "✅ 匿名メッセージを投稿しました！", components: [] });
    } catch (error) {
        console.error("[anonymousPost error]:", error);
        await interaction.editReply({
            content: "⚠️ 投稿中にエラーが発生しました。",
            components: [],
        });
    }
}
