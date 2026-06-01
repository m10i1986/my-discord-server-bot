import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { RepliableInteraction, SendableChannels } from 'discord.js';
import { logPost, updateMessageId } from './database';

export interface AnonymousPostData {
    readonly userId: string;
    readonly guildId: string;
    readonly channelId: string;
    readonly content: string | null;
    readonly attachmentUrl: string | null;
    readonly attachmentName: string | null;
}

function buildEmbed(data: AnonymousPostData, logId?: number): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
    const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setFooter({ text: logId !== undefined ? `Anonymous (id:${logId})` : 'Anonymous' });

    if (data.content) {
        embed.setDescription(data.content);
    }

    const files: AttachmentBuilder[] = [];

    if (data.attachmentUrl && data.attachmentName) {
        const attachment = new AttachmentBuilder(data.attachmentUrl, {
            name: data.attachmentName,
        });
        embed.setImage(`attachment://${data.attachmentName}`);
        files.push(attachment);
    }

    return { embed, files };
}

export async function sendAnonymousPost(
    channel: SendableChannels,
    data: AnonymousPostData,
): Promise<void> {
    const logId = logPost({
        userId: data.userId,
        guildId: data.guildId,
        channelId: data.channelId,
        messageId: null,
        content: data.content,
        attachmentUrl: data.attachmentUrl,
    });
    const { embed, files } = buildEmbed(data, logId);
    const sent = await channel.send({ embeds: [embed], files });

    updateMessageId(logId, sent.id);
}

/**
 * インタラクション Webhook 経由で匿名投稿する。
 * Bot が VIEW_CHANNEL 権限を持たないチャンネルでも投稿可能。
 * 未返信の場合は reply()、返信済みの場合は followUp() を使用する。
 */
export async function sendAnonymousPostViaInteraction(
    interaction: RepliableInteraction,
    data: AnonymousPostData,
): Promise<void> {
    const logId = logPost({
        userId: data.userId,
        guildId: data.guildId,
        channelId: data.channelId,
        messageId: null,
        content: data.content,
        attachmentUrl: data.attachmentUrl,
    });
    const { embed, files } = buildEmbed(data, logId);

    let sentId: string;
    if (interaction.deferred || interaction.replied) {
        const sent = await interaction.followUp({ ephemeral: false, embeds: [embed], files });
        sentId = sent.id;
    } else {
        const sent = await interaction.reply({ ephemeral: false, embeds: [embed], files, fetchReply: true });
        sentId = sent.id;
    }

    updateMessageId(logId, sentId);
}
