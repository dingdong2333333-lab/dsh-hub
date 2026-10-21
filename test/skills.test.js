import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFixtureHome, createServices, makeUserSkill } from './helpers/fixture.js';

test('skills list merges user skills and read-only office skills', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  makeUserSkill(home.home, 'my-skill', { name: '我的技能', description: '测试用户技能' });
  const installDir = path.join(home.root, 'install');
  fs.mkdirSync(path.join(installDir, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(installDir, 'DeepSeek Harness.exe'), 'fixture');
  fs.writeFileSync(path.join(installDir, 'resources', 'app.asar'), 'fixture');
  const officeFile = path.join(installDir, 'resources', 'runtime', 'office-skills', 'office-docx', 'SKILL.md');
  fs.mkdirSync(path.dirname(officeFile), { recursive: true });
  fs.writeFileSync(officeFile, '---\nname: office-docx\ndescription: Word documents\n---\n\n# Office DOCX\n');
  const services = createServices(home);
  const data = await services.skillService.list();
  assert.equal(data.stats.total, 2);
  assert.equal(data.stats.user, 1);
  assert.equal(data.stats.builtin, 1);
  const userSkill = data.skills.find((skill) => skill.slug === 'my-skill');
  const office = data.skills.find((skill) => skill.slug === 'office-docx');
  assert.equal(userSkill.editable, true);
  assert.equal(office.editable, false);
});

test('create, edit, duplicate and delete a user skill', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  const created = await services.skillService.create({
    slug: 'demo-skill',
    name: '演示技能',
    description: '这是一个演示',
    body: '# 演示\n\n内容。',
  });
  assert.equal(created.key, 'user:demo-skill');
  assert.ok(fs.existsSync(path.join(home.home, 'skills', 'demo-skill', 'SKILL.md')));

  const saved = await services.skillService.save('user:demo-skill', '---\nname: 演示技能\ndescription: 更新后的描述\n---\n\n# 更新\n');
  assert.equal(saved.description, '更新后的描述');
  assert.ok(fs.existsSync(path.join(home.dataDir, 'backups', 'skills')));

  const duplicate = await services.skillService.duplicate('user:demo-skill', 'demo-skill-copy');
  assert.match(duplicate.content, /演示技能 副本/);

  let trashed = null;
  await services.skillService.delete('user:demo-skill', async (target) => {
    trashed = target;
    fs.rmSync(target, { recursive: true, force: true });
  });
  assert.equal(trashed, path.join(home.home, 'skills', 'demo-skill'));
  assert.equal(fs.existsSync(trashed), false);
});

test('built-in skills are read-only and cannot be saved or deleted', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home.root, 'install'), { recursive: true });
  fs.writeFileSync(path.join(home.root, 'install', 'DeepSeek Harness.exe'), '');
  const officeFile = path.join(home.root, 'install', 'resources', 'runtime', 'office-skills', 'office-xlsx', 'SKILL.md');
  fs.mkdirSync(path.dirname(officeFile), { recursive: true });
  fs.writeFileSync(officeFile, '---\nname: office-xlsx\ndescription: Excel\n---\n\n# XLSX\n');
  const services = createServices(home);
  await assert.rejects(services.skillService.save('office:office-xlsx', '---\nname: x\ndescription: y\n---\n'), /只读/);
  await assert.rejects(services.skillService.delete('office:office-xlsx', async () => {}), /不能删除/);
});

test('invalid slugs and traversal keys are rejected', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  const services = createServices(home);
  await assert.rejects(services.skillService.create({ slug: '../evil', name: 'x', description: 'y' }), /标识/);
  await assert.rejects(services.skillService.create({ slug: 'con', name: 'x', description: 'y' }), /保留名/);
  assert.throws(() => services.skillService.resolve('user:../evil'), /标识/);
});

test('saving invalid frontmatter is rejected', async (t) => {
  const home = createFixtureHome();
  t.after(() => fs.rmSync(home.root, { recursive: true, force: true }));
  makeUserSkill(home.home, 'valid-skill');
  const services = createServices(home);
  await assert.rejects(services.skillService.save('user:valid-skill', '# no frontmatter'), /frontmatter/);
});
