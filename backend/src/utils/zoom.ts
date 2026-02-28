// Utility for creating Zoom meetings using a JWT/OAuth bearer token stored in settings
import { settingsRepository } from '../repositories';

export interface ZoomMeetingOptions {
  topic: string;
  startTime: string; // ISO
  duration?: number; // minutes
  settings?: Record<string, any>;
}

export async function createZoomMeetingFromSettings(opts: ZoomMeetingOptions) {
  const token = await settingsRepository.get<string>('zoom_jwt_token');
  if (!token) {
    throw new Error('Zoom not configured');
  }

  const body: any = {
    topic: opts.topic,
    type: 2,
    start_time: opts.startTime,
    duration: opts.duration ?? 60,
    settings: {
      join_before_host: true,
      approval_type: 0,
      mute_upon_entry: true,
      ...opts.settings,
    },
  };

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data;
}
