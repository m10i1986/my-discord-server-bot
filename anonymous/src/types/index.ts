export interface PendingPost {
    readonly userId: string;
    readonly guildId: string;
    readonly channelId: string;
    readonly content: string | null;
    readonly attachmentUrl: string | null;
    readonly attachmentName: string | null;
    readonly expiresAt: number;
}
