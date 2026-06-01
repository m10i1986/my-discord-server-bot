import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
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

    // 同意済みユーザーはそのまま投稿
    if (hasUserConsented(userId)) {
        // ephemeral: true で defer することで「X さんが /ano を使用しました」が公開されない
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.channel;
        if (!channel || !channel.isSendable()) {
            await interaction.editReply({ content: "⚠️ このチャンネルには投稿できません。" });
            return;
        }
        await sendAnonymousPost(channel, {
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
