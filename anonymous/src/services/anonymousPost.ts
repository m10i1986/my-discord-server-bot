import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { SendableChannels } from 'discord.js';
import { logPost } from './database';

export interface AnonymousPostData {
    readonly userId: string;
    readonly guildId: string;
    readonly channelId: string;
    readonly content: string | null;
    readonly attachmentUrl: string | null;
    readonly attachmentName: string | null;
}

export async function sendAnonymousPost(
    channel: SendableChannels,
    data: AnonymousPostData,
): Promise<void> {
    const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setFooter({ text: '匿名メッセージ' });

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

    const sent = await channel.send({ embeds: [embed], files });

    logPost({
        userId: data.userId,
        guildId: data.guildId,
        channelId: data.channelId,
        messageId: sent.id,
        content: data.content,
        attachmentUrl: data.attachmentUrl,
    });
}
