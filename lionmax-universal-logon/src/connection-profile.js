const fields = {
  microsoft: ['clientId', 'tenantId'],
  google: ['clientId', 'clientSecretEnv'],
  slack: ['clientId', 'callbackOrigin'],
};

export function profileTemplate(provider) {
  if (!Object.hasOwn(fields, provider)) throw Error('Choose an included provider.');
  return { version: 1, provider, settings: Object.fromEntries(fields[provider].map(key => [key, ''])) };
}

export function parseProfile(text, provider) {
  if (typeof text !== 'string' || text.length > 4096) throw Error('Choose a LionMax setup profile smaller than 4 KB.');
  let profile;
  try { profile = JSON.parse(text); } catch { throw Error('The setup profile is not valid JSON.'); }
  const template = profileTemplate(provider);
  if (!profile || profile.version !== 1 || profile.provider !== provider || !profile.settings || Array.isArray(profile.settings) || typeof profile.settings !== 'object') throw Error('Choose a version 1 LionMax profile for this provider.');
  if (Object.keys(profile).some(key => !['version', 'provider', 'settings'].includes(key)) || Object.keys(profile.settings).some(key => !Object.hasOwn(template.settings, key))) throw Error('The profile contains unsupported fields. Use a LionMax template without passwords, tokens or client secrets.');
  if (Object.values(profile.settings).some(value => typeof value !== 'string' || value.length > 240)) throw Error('Profile fields must be text up to 240 characters.');
  return profile.settings;
}
