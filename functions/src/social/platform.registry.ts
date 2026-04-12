import { SocialPlatform, SocialPlatformId } from './platform.interface';
import {
  InstagramPlatform,
  META_APP_ID,
  META_APP_SECRET,
} from './platforms/instagram.platform';
import { FacebookPlatform } from './platforms/facebook.platform';
import {
  TwitterPlatform,
  TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET,
} from './platforms/twitter.platform';
import {
  TiktokPlatform,
  TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET,
} from './platforms/tiktok.platform';
import { SOCIAL_OAUTH_SIGNING_SECRET } from './oauth/state';

const PLATFORMS: Record<SocialPlatformId, () => SocialPlatform> = {
  instagram: () => new InstagramPlatform(),
  facebook: () => new FacebookPlatform(),
  twitter: () => new TwitterPlatform(),
  tiktok: () => new TiktokPlatform(),
};

/** All secrets any platform might need, declared on social callables. */
export const SOCIAL_PLATFORM_SECRETS = [
  META_APP_ID,
  META_APP_SECRET,
  TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET,
  TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET,
  SOCIAL_OAUTH_SIGNING_SECRET,
];

export function getPlatform(id: string): SocialPlatform {
  const factory = PLATFORMS[id as SocialPlatformId];
  if (!factory) throw new Error(`Unknown social platform: ${id}`);
  return factory();
}

export function listPlatforms(): Array<{
  id: string;
  label: string;
  configured: boolean;
  supportedMediaTypes: readonly string[];
}> {
  return (Object.keys(PLATFORMS) as SocialPlatformId[]).map((id) => {
    const p = PLATFORMS[id]();
    return {
      id: p.id,
      label: p.label,
      configured: p.isConfigured(),
      supportedMediaTypes: p.supportedMediaTypes,
    };
  });
}
