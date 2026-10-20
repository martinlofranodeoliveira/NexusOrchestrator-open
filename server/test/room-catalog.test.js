const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_ROLE_ROOM_SPECS,
  DEFAULT_PRIMARY_ROOM_REPLICAS,
  DEFAULT_REVIEW_ROOM_REPLICAS,
  buildDefaultAgentBlueprints,
  buildRoomOccupancy,
  findRoomForAgent,
  resolveBuiltinRoomTopology,
  resolveRoomTemplates,
} = require('../services/roomCatalog');

test('resolveRoomTemplates uses builtin role-cell topology by default', () => {
  const rooms = resolveRoomTemplates({});

  assert.equal(resolveBuiltinRoomTopology({}), 'role_cells');
  assert.equal(Array.isArray(rooms), true);
  assert.equal(rooms.length, DEFAULT_ROLE_ROOM_SPECS.length);
  assert.equal(rooms.some((room) => room.id === 'ceo_command'), true);
  assert.equal(rooms.some((room) => room.id === 'pm_primary_cell'), true);
  assert.equal(rooms.some((room) => room.id === 'qa_review_cell'), true);
  assert.equal(rooms.every((room) => room.topology === 'role_cells'), true);
});

test('buildDefaultAgentBlueprints replicates builtin archetype rooms while preserving canonical ids', () => {
  const blueprints = buildDefaultAgentBlueprints({
    NEXUS_PRIMARY_ROOM_REPLICAS: '3',
    NEXUS_REVIEW_ROOM_REPLICAS: '2',
  });

  assert.equal(blueprints.some((agent) => agent.id === 'ceo'), true);
  assert.equal(blueprints.some((agent) => agent.id === 'ceo_2'), false);
  assert.equal(blueprints.some((agent) => agent.id === 'dev'), true);
  assert.equal(blueprints.some((agent) => agent.id === 'dev_2'), true);
  assert.equal(blueprints.some((agent) => agent.id === 'dev_3'), true);
  assert.equal(blueprints.some((agent) => agent.id === 'pm_review'), true);
  assert.equal(blueprints.some((agent) => agent.id === 'pm_review_2'), true);
  assert.equal(
    blueprints.filter((agent) => agent.roomId === 'ceo_command').length,
    1,
  );
  assert.equal(
    blueprints.filter((agent) => agent.roomId === 'dev_primary_cell').length,
    3,
  );
  assert.equal(
    blueprints.filter((agent) => agent.roomId === 'qa_review_cell').length,
    2,
  );
});

test('resolveRoomTemplates defaults every builtin room to seven replicas', () => {
  const rooms = resolveRoomTemplates({});
  const ceoRoom = rooms.find((room) => room.id === 'ceo_command');
  const nonCeoRooms = rooms.filter((room) => room.id !== 'ceo_command');

  assert.equal(rooms.length, DEFAULT_ROLE_ROOM_SPECS.length);
  assert.equal(ceoRoom?.configuredSlots, 1);
  assert.equal(
    nonCeoRooms
      .filter((room) => room.team === 'primary')
      .every((room) => room.configuredSlots === DEFAULT_PRIMARY_ROOM_REPLICAS),
    true,
  );
  assert.equal(
    nonCeoRooms.filter((room) => room.team === 'review').every(
      (room) => room.configuredSlots === DEFAULT_REVIEW_ROOM_REPLICAS,
    ),
    true,
  );
});

test('resolveRoomTemplates supports declarative rooms with generated roles', () => {
  const payload = JSON.stringify([
    {
      id: 'delivery_pod',
      name: 'Delivery Pod',
      team: 'primary',
      floor: 1,
      topology: 'custom_swarm',
      specializationRole: 'dev',
      roles: [
        { role: 'dev', count: 2, namePrefix: 'Engineer', archetypeId: 'delivery_dev' },
        { role: 'qa', count: 1, namePrefix: 'QA', archetypeId: 'delivery_qa' },
      ],
    },
  ]);
  const rooms = resolveRoomTemplates({
    NEXUS_ROOM_TEMPLATES_JSON: payload,
  });

  assert.deepEqual(
    rooms.map((room) => room.id),
    ['delivery_pod'],
  );
  assert.equal(rooms[0].agents.length, 3);
  assert.equal(rooms[0].agents[0].roomId, 'delivery_pod');
  assert.equal(rooms[0].configuredSlots, 3);
  assert.equal(rooms[0].topology, 'custom_swarm');
});

test('resolveRoomTemplates preserves direct agent MCP capabilities', () => {
  const payload = JSON.stringify([
    {
      id: 'game_dev_cell',
      name: 'Game Dev',
      team: 'primary',
      floor: 1,
      agents: [
        {
          id: 'dev',
          name: 'Game Engineer',
          role: 'dev',
          mcps: ['stitch', 'stitch'],
          llmProvider: 'openai_compat',
          model: 'qwen3.6:35b-a3b-mtp-q4_K_M',
          reasoningEffort: 'medium',
          fallbackModels: ['openai_compat/gpt-oss:20b'],
          skills: ['game-factory'],
          prompt: 'Build playable games.',
        },
      ],
    },
  ]);
  const [room] = resolveRoomTemplates({
    NEXUS_ROOM_TEMPLATES_JSON: payload,
  });

  assert.deepEqual(room.agents[0].mcps, ['stitch']);
  assert.equal(room.agents[0].llmProvider, 'openai_compat');
  assert.equal(room.agents[0].model, 'qwen3.6:35b-a3b-mtp-q4_K_M');
  assert.equal(room.agents[0].reasoningEffort, 'medium');
  assert.deepEqual(room.agents[0].fallbackModels, ['openai_compat/gpt-oss:20b']);
  assert.deepEqual(room.agents[0].skills, ['game-factory']);
  assert.equal(room.agents[0].prompt, 'Build playable games.');

  const [blueprint] = buildDefaultAgentBlueprints({
    NEXUS_ROOM_TEMPLATES_JSON: payload,
  });
  assert.equal(blueprint.mcps.includes('stitch'), true);
  assert.equal(blueprint.llmProvider, 'openai_compat');
  assert.equal(blueprint.model, 'qwen3.6:35b-a3b-mtp-q4_K_M');
});

test('findRoomForAgent matches replicas back to the correct archetype room', () => {
  const rooms = resolveRoomTemplates({
    NEXUS_PRIMARY_ROOM_REPLICAS: '3',
    NEXUS_REVIEW_ROOM_REPLICAS: '2',
  });

  const devCloneRoom = findRoomForAgent(rooms, {
    id: 'dev_3',
    role: 'dev',
    team: 'primary',
  });
  const reviewCloneRoom = findRoomForAgent(rooms, {
    id: 'qa_review_2',
    role: 'qa',
    team: 'review',
  });

  assert.equal(devCloneRoom?.id, 'dev_primary_cell');
  assert.equal(reviewCloneRoom?.id, 'qa_review_cell');
});

test('buildRoomOccupancy exposes topology, specialization and interlinked room metadata', () => {
  const rooms = resolveRoomTemplates({
    NEXUS_PRIMARY_ROOM_REPLICAS: '2',
    NEXUS_REVIEW_ROOM_REPLICAS: '2',
  });
  const occupancy = buildRoomOccupancy(rooms, [
    { id: 'pm', roomId: 'pm_primary_cell' },
    { id: 'pm_2', roomId: 'pm_primary_cell' },
    { id: 'dev_review', roomId: 'dev_review_cell' },
  ]);

  const pmRoom = occupancy.find((room) => room.id === 'pm_primary_cell');
  const devReviewRoom = occupancy.find((room) => room.id === 'dev_review_cell');

  assert.equal(pmRoom?.occupants, 2);
  assert.equal(pmRoom?.replicaTarget, 2);
  assert.equal(pmRoom?.specializationRole, 'pm');
  assert.equal(pmRoom?.topology, 'role_cells');
  assert.equal(Array.isArray(pmRoom?.interlinkedRoomIds), true);
  assert.equal((pmRoom?.interlinkedRoomIds || []).length > 0, true);

  assert.equal(devReviewRoom?.occupants, 1);
  assert.equal(devReviewRoom?.specializationRole, 'dev');
});
