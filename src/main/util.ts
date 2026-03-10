/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import crypto from "crypto"

interface ReplayHashSource {
  metadata?: {
    sceneDesc?: string;
    session?: string;
  };
  replayName?: string;
  timestamp?: number;
  size?: number;
}

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

export function generateReplayHash(replay: ReplayHashSource): string {
  const identityString = [
    replay.metadata?.sceneDesc,
    replay.metadata?.session,
    replay.replayName,
    replay.timestamp,
    replay.size
  ].join("|")

  return crypto
    .createHash("sha256")
    .update(identityString)
    .digest("hex")
}
