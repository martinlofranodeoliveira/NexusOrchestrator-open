const fs = require('fs');
const path = require('path');

function normalizeSkillId(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function normalizeSkillList(values) {
  const list = Array.isArray(values)
    ? values
    : String(values || '')
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean);

  return [...new Set(list.map(normalizeSkillId).filter(Boolean))];
}

function defaultSkillRoots(projectDir) {
  const resolvedProjectDir = path.resolve(String(projectDir || process.cwd()));
  return [
    path.join(resolvedProjectDir, '.nexus', 'skills'),
    path.resolve(__dirname, '..', '..', 'skills'),
  ];
}

function parseSkillMetadata(skillDir, markdownContent) {
  const metadataPath = path.join(skillDir, 'skill.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  const lines = String(markdownContent || '')
    .split(/\r?\n/)
    .slice(0, 12);
  const heading = lines.find((line) => /^#\s+/.test(line));
  return heading
    ? { title: heading.replace(/^#\s+/, '').trim() }
    : {};
}

function collectSkillFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const files = [];
  const stack = [path.resolve(rootDir)];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach((entry) => {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        return;
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        files.push(entryPath);
      }
    });
  }

  return files;
}

function discoverSkills(skillRoots) {
  const discovered = [];

  (Array.isArray(skillRoots) ? skillRoots : [])
    .map((root) => path.resolve(String(root || '').trim()))
    .filter(Boolean)
    .forEach((rootDir) => {
      collectSkillFiles(rootDir).forEach((filePath) => {
        const skillDir = path.dirname(filePath);
        const markdown = fs.readFileSync(filePath, 'utf8');
        const metadata = parseSkillMetadata(skillDir, markdown);
        const relativeDir = path.relative(rootDir, skillDir);
        const defaultId =
          relativeDir && relativeDir !== '.'
            ? normalizeSkillId(relativeDir)
            : normalizeSkillId(path.basename(skillDir));
        const hookCandidates = ['hooks.js', 'hooks.cjs', 'hooks.mjs', 'hook.js', 'hook.cjs', 'hook.mjs']
          .map((fileName) => path.join(skillDir, fileName))
          .filter((candidatePath) => fs.existsSync(candidatePath));

        discovered.push({
          id: normalizeSkillId(metadata.id || defaultId),
          title: String(metadata.title || metadata.name || defaultId).trim() || defaultId,
          description: String(metadata.description || '').trim() || null,
          roles: normalizeSkillList(metadata.roles),
          teams: normalizeSkillList(metadata.teams),
          taskKeywords: normalizeSkillList(metadata.taskKeywords || metadata.keywords),
          prompt: markdown.trim(),
          rootDir,
          skillDir,
          skillFile: filePath,
          hookFiles: hookCandidates,
        });
      });
    });

  return discovered
    .filter((skill) => skill.id)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveApplicableSkills(params = {}) {
  const agent = params.agent || {};
  const taskTitle = String(params.taskTitle || '').trim().toLowerCase();
  const allSkills = discoverSkills(params.skillRoots || defaultSkillRoots(params.projectDir));
  const explicitSkillIds = normalizeSkillList(agent.skills);

  return allSkills.filter((skill) => {
    if (explicitSkillIds.includes(skill.id)) return true;

    if (skill.roles.length > 0 && skill.roles.includes(normalizeSkillId(agent.role))) {
      return true;
    }

    if (skill.teams.length > 0 && skill.teams.includes(normalizeSkillId(agent.team))) {
      return true;
    }

    if (
      skill.taskKeywords.length > 0 &&
      taskTitle &&
      skill.taskKeywords.some((keyword) => taskTitle.includes(keyword))
    ) {
      return true;
    }

    return false;
  });
}

function buildSkillsPrompt(skills) {
  const normalizedSkills = Array.isArray(skills) ? skills : [];
  if (normalizedSkills.length === 0) return '';

  return normalizedSkills
    .map((skill) => `Skill ${skill.id}:\n${skill.prompt}`)
    .join('\n\n');
}

module.exports = {
  buildSkillsPrompt,
  defaultSkillRoots,
  discoverSkills,
  normalizeSkillId,
  normalizeSkillList,
  resolveApplicableSkills,
};
