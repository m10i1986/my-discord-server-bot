import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import type { Client, SendableChannels } from "discord.js";
import { logPost, updateMessageId } from "./database";

export interface AnonymousPostData {
    readonly userId: string;
    readonly guildId: string;
    readonly channelId: string;
    readonly content: string | null;
    readonly attachmentUrl: string | null;
    readonly attachmentName: string | null;
}

function buildEmbed(
    data: AnonymousPostData,
    logId?: string,
): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
    const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setFooter({ text: logId !== undefined ? `Anonymous (id:${logId})` : "Anonymous" });

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

/**
 * 投稿先チャンネルを解決する。
 * キャッシュが無い場合は API から取得し、送信可能なチャンネルのみ返す。
 * 送信権限の有無（SendMessages / SendMessagesInThreads 等）はチャンネル型ごとに
 * 異なるため事前チェックせず、実際の send() 実行時に判定する。
 */
export async function resolveSendableChannel(
    client: Client,
    channelId: string,
    cached: { isSendable(): boolean } | null = null,
): Promise<SendableChannels | null> {
    if (cached?.isSendable()) {
        console.log(`[channel] using cached channel=${channelId}`);
        return cached as SendableChannels;
    }
    console.log(`[channel] cache miss, fetching channel=${channelId}`);
    const channel = await client.channels.fetch(channelId).catch((e) => {
        console.error(`[channel] fetch failed channel=${channelId}`, e);
        return null;
    });
    const result = channel?.isSendable() ? channel : null;
    console.log(
        `[channel] fetch result=${result ? result.id : "null (not sendable or fetch failed)"}`,
    );
    return result;
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
