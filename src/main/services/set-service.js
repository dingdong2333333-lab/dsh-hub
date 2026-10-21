import { AppError } from '../utils/errors.js';

/**
 * "Sets" are user-defined groups of bundles that can be enabled or disabled
 * together. They are metadata only; the actual state remains DSH's ordered
 * `dsh.profile.bundles` list.
 */
export class SetService {
  constructor({ profileService, pluginService, metadataStore, logger }) {
    this.profileService = profileService;
    this.pluginService = pluginService;
    this.metadataStore = metadataStore;
    this.logger = logger.child('sets');
  }

  async list(profileName) {
    const profile = this.profileService.getProfile(profileName);
    const data = this.metadataStore.readSets(profile.name);
    const inventory = await this.pluginService.list(profile.name);
    const byName = new Map(inventory.plugins.map((plugin) => [plugin.name, plugin]));
    const sets = data.sets.map((set) => decorateSet(set, byName));
    return {
      profile: { name: profile.name, dir: profile.dir },
      stats: {
        total: sets.length,
        active: sets.filter((set) => set.state === 'all').length,
        partial: sets.filter((set) => set.state === 'partial').length,
      },
      sets,
    };
  }

  async create(profileName, input) {
    const profile = this.profileService.getProfile(profileName);
    const inventory = await this.pluginService.list(profile.name);
    const validNames = new Set(inventory.plugins.filter((plugin) => plugin.canToggle).map((plugin) => plugin.name));
    const pluginNames = Array.isArray(input?.pluginNames)
      ? input.pluginNames.filter((name) => validNames.has(name))
      : [];
    if (!pluginNames.length) {
      throw new AppError('EMPTY_SET', '请至少选择一个可以启停的插件。');
    }
    const set = await this.metadataStore.createSet(profile.name, {
      name: input?.name,
      description: input?.description,
      color: input?.color,
      icon: input?.icon,
      pluginNames,
    });
    const decorated = decorateSet(set, new Map(inventory.plugins.map((plugin) => [plugin.name, plugin])));
    return decorated;
  }

  async update(profileName, id, input) {
    const profile = this.profileService.getProfile(profileName);
    const inventory = await this.pluginService.list(profile.name);
    const validNames = new Set(inventory.plugins.filter((plugin) => plugin.canToggle).map((plugin) => plugin.name));
    const patch = { ...input };
    if (Array.isArray(input?.pluginNames)) {
      patch.pluginNames = input.pluginNames.filter((name) => validNames.has(name));
      if (!patch.pluginNames.length) throw new AppError('EMPTY_SET', '套装里至少需要一个可以启停的插件。');
    }
    const set = await this.metadataStore.updateSet(profile.name, id, patch);
    return decorateSet(set, new Map(inventory.plugins.map((plugin) => [plugin.name, plugin])));
  }

  async delete(profileName, id) {
    const profile = this.profileService.getProfile(profileName);
    return this.metadataStore.deleteSet(profile.name, id);
  }

  async apply(profileName, id, action) {
    if (!['enable', 'disable'].includes(action)) {
      throw new AppError('INVALID_ACTION', '只能启用或停用套装。');
    }
    const profile = this.profileService.getProfile(profileName);
    const data = this.metadataStore.readSets(profile.name);
    const set = data.sets.find((item) => item.id === id);
    if (!set) throw new AppError('SET_NOT_FOUND', '没有找到这个套装。');
    if (!set.pluginNames.length) throw new AppError('EMPTY_SET', '这个套装里没有插件。');
    const result = await this.pluginService.setMany(profile.name, set.pluginNames, action === 'enable');
    if (result.changed) {
      await this.metadataStore.markSetApplied(profile.name, set.id, action);
    }
    this.logger.info('Set applied', {
      profile: profile.name,
      set: set.name,
      action,
      applied: result.applied,
      skipped: result.skipped,
    });
    const decorated = decorateSet(
      { ...set, lastAppliedAt: new Date().toISOString(), lastAction: action },
      new Map((await this.pluginService.list(profile.name)).plugins.map((plugin) => [plugin.name, plugin])),
    );
    return { ...result, set: decorated };
  }
}

function decorateSet(set, byName) {
  const members = set.pluginNames.map((name) => {
    const plugin = byName.get(name);
    return {
      name,
      displayName: plugin?.displayName || '',
      title: plugin?.title || name,
      enabled: Boolean(plugin?.enabled),
      canToggle: Boolean(plugin?.canToggle),
      missing: Boolean(plugin?.missing),
      version: plugin?.version || '',
      category: plugin?.category || '',
    };
  });
  const enabledCount = members.filter((member) => member.enabled).length;
  const state = enabledCount === 0 ? 'none' : enabledCount === members.length ? 'all' : 'partial';
  return {
    ...set,
    members,
    enabledCount,
    totalCount: members.length,
    state,
    missingCount: members.filter((member) => member.missing || !member.canToggle).length,
  };
}

export { decorateSet };
