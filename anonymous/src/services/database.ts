import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// __dirname は dist/services/ または src/services/ のどちらでも ../../data が正しい位置
const DB_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'anonymous.db');

// 1年 = 365日
const LOG_RETENTION_DAYS = 365;

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL モードで耐障害性を向上
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS anonymous_posts (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id        TEXT    NOT NULL,
        guild_id       TEXT    NOT NULL,
        channel_id     TEXT    NOT NULL,
        message_id     TEXT,
        content        TEXT,
        attachment_url TEXT,
        created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_posts_user_id
        ON anonymous_posts (user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at
        ON anonymous_posts (created_at);

    CREATE TABLE IF NOT EXISTS user_consents (
        user_id      TEXT PRIMARY KEY,
        consented_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
`);

export interface PostLog {
    userId: string;
    guildId: string;
    channelId: string;
    messageId: string | null;
    content: string | null;
    attachmentUrl: string | null;
}

const stmtHasConsented = db.prepare(
    'SELECT 1 FROM user_consents WHERE user_id = ?',
);
const stmtInsertConsent = db.prepare(
    'INSERT OR IGNORE INTO user_consents (user_id) VALUES (?)',
);
const stmtInsertPost = db.prepare(
    `INSERT INTO anonymous_posts
        (user_id, guild_id, channel_id, message_id, content, attachment_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
);
const stmtPrune = db.prepare(
    `DELETE FROM anonymous_posts
     WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-${LOG_RETENTION_DAYS} days')`,
);

export function hasUserConsented(userId: string): boolean {
    return stmtHasConsented.get(userId) !== undefined;
}

export function recordConsent(userId: string): void {
    stmtInsertConsent.run(userId);
}

export function logPost(post: PostLog): number {
    const result = stmtInsertPost.run(
        post.userId,
        post.guildId,
        post.channelId,
        post.messageId,
        post.content,
        post.attachmentUrl,
    );
    return Number(result.lastInsertRowid);
}

const stmtUpdateMessageId = db.prepare(
    'UPDATE anonymous_posts SET message_id = ? WHERE id = ?',
);

export function updateMessageId(logId: number, messageId: string): void {
    stmtUpdateMessageId.run(messageId, logId);
}

export function pruneOldLogs(): number {
    const result = stmtPrune.run();
    return result.changes;
}
