import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
    SlashCommandBuilder,
    type SlashCommandOptionsOnlyBuilder,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type { BotClient } from "./client";
import { hasUserConsented } from "./services/database";
import { sendAnonymousPost } from "./services/anonymousPost";

const WARNING_MD_PATH = path.resolve(__dirname, "../messages/warning.md");
const PENDING_TTL_MS = 2 * 60 * 1000; // 2分
const ANO_MODAL_ID = "ano_modal";
const ANO_MESSAGE_INPUT_ID = "ano_message_input";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function readWarning(): string {
    return fs.readFileSync(WARNING_MD_PATH, "utf-8");
}

export const anoCommandData: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
    .setName("ano")
    .setDescription("匿名メッセージをこのチャンネルに投稿します")
    .addStringOption((option) =>
        option
            .setName("message")
            .setDescription("投稿するメッセージ本文")
            .setRequired(false)
            .setMaxLength(2000),
    )
    .addAttachmentOption((option) =>
        option
            .setName("attachment")
            .setDescription("添付画像（JPEG / PNG / GIF / WebP）")
            .setRequired(false),
    );

export async function executeAno(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "このコマンドはサーバー内でのみ使用できます。",
            ephemeral: true,
        });
        return;
    }

    const content = interaction.options.getString("message");
    const attachment = interaction.options.getAttachment("attachment");

    if (!content && !attachment) {
        const modal = new ModalBuilder().setCustomId(ANO_MODAL_ID).setTitle("匿名メッセージを投稿");
        const messageInput = new TextInputBuilder()
            .setCustomId(ANO_MESSAGE_INPUT_ID)
            .setLabel("メッセージ本文")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));
        await interaction.showModal(modal);
        return;
    }

    if (attachment && !ALLOWED_IMAGE_TYPES.has(attachment.contentType ?? "")) {
        await interaction.reply({
            content: "画像ファイル（JPEG / PNG / GIF / WebP）のみ添付可能です。",
            ephemeral: true,
        });
        return;
    }

    const attachmentUrl = attachment?.proxyURL ?? null;
    const attachmentName = attachment?.name ?? null;

    await handleAnoPost(interaction, content, attachmentUrl, attachmentName);
}

async function handleAnoPost(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
    content: string | null,
    attachmentUrl: string | null,
    attachmentName: string | null,
): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;
    const channelId = interaction.channelId!;

    // 同意済みユーザーはボタン不要でそのまま公開投稿する。
    // ephemeral: true で defer することで「X さんが /ano を使用しました」が公開されず、
    // channel.send() で送信することで実行者名を出さずに全員に見える形で投稿できる。
    if (hasUserConsented(userId)) {
        await interaction.deferReply({ ephemeral: true });
        const rawChannel =
            interaction.channel ??
            (await interaction.client.channels.fetch(interaction.channelId!).catch(() => null));
        if (!rawChannel || !rawChannel.isSendable()) {
            await interaction.editReply({
                content: "⚠️ このチャンネルへの書き込み権限がありません。",
            });
            return;
        }
        const me = interaction.guild?.members.me;
        if (
            me &&
            !rawChannel.isDMBased() &&
            !me.permissionsIn(rawChannel).has(PermissionFlagsBits.SendMessages)
        ) {
            await interaction.editReply({
                content: "⚠️ このチャンネルへの書き込み権限がありません。",
            });
            return;
        }
        await sendAnonymousPost(rawChannel, {
            userId,
            guildId,
            channelId,
            content,
            attachmentUrl,
            attachmentName,
        });
        await interaction.editReply({ content: "✅ 匿名メッセージを投稿しました！" });
        return;
    }

    // 初回: 警告を表示してボタン確認
    const nonce = randomUUID();
    const client = interaction.client as BotClient;

    client.pendingPosts.set(nonce, {
        userId,
        guildId,
        channelId,
        content,
        attachmentUrl,
        attachmentName,
        expiresAt: Date.now() + PENDING_TTL_MS,
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`ano_confirm:${nonce}`)
            .setLabel("同意して投稿する")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`ano_cancel:${nonce}`)
            .setLabel("キャンセル")
            .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
        content: readWarning(),
        components: [row],
        ephemeral: true,
    });
}

export async function executeAnoFromModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "このコマンドはサーバー内でのみ使用できます。",
            ephemeral: true,
        });
        return;
    }

    const content = interaction.fields.getTextInputValue(ANO_MESSAGE_INPUT_ID);
    await handleAnoPost(interaction, content, null, null);
}
