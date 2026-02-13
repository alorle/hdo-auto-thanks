export type SiteConfig = {
  name: string;
  baseUrl: string;
  envPrefix: string;
  loginButtonSelector: string;
};

export const SITES: Record<string, SiteConfig> = {
  hdo: { name: "hdo-olimpo", baseUrl: "https://hd-olimpo.club", envPrefix: "HDO", loginButtonSelector: 'button[type="submit"]' },
  f1: { name: "f1-carreras", baseUrl: "https://f1carreras.xyz", envPrefix: "F1", loginButtonSelector: "button.auth-form__primary-button" },
};

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return value;
}

export function getSiteCredentials(site: SiteConfig): { username: string; password: string } {
  return {
    username: getRequiredEnv(`${site.envPrefix}_USERNAME`),
    password: getRequiredEnv(`${site.envPrefix}_PASSWORD`),
  };
}
