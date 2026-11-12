import { ok } from '../utils/response.js';
import { audit } from '../services/admin.service.js';
import { getSettings, toAdminShape, updateSettings } from '../services/settings.service.js';

export const get = async (req, res) => ok(res, toAdminShape(await getSettings({ fresh: true })));

const save = (group) => async (req, res) => {
  const patch = group ? { [group]: req.body } : req.body;
  const settings = await updateSettings(patch);
  await audit(req.admin.id, 'settings.update', 'settings', null, { groups: Object.keys(patch) });
  ok(res, settings, 'Settings saved');
};

export const update = save(null);
export const updatePersonality = save('personality');
export const updateWhatsapp = save('whatsapp');
export const updateAppearance = save('appearance');
