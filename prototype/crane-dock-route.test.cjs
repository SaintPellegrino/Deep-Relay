'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const html = readFileSync(join(__dirname, 'deep-relay-crane-dock.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(script, 'standalone model script is present');
const context = {};
runInNewContext(script[1], context);
const model = context.DockwardModel;
assert.ok(model, 'standalone model loaded');

function tick(state, input = {}, count = 1) {
  for (let i = 0; i < count; i++) model.step(state, input, 1 / 60);
}
function until(state, predicate, input, limit = 1000) {
  for (let i = 0; i < limit; i++) {
    if (predicate(state)) return;
    tick(state, input);
  }
  assert.fail('route blocked near x=' + state.p.x + ', feet=' + (state.p.y + state.p.h));
}

test('winch route lowers the lift, awards the coil, and restores it from a v1 save', () => {
  const state = model.create();
  until(state, s => s.p.x >= 932, { right: true });
  tick(state, { action: true }); tick(state);
  assert.equal(state.flags.magnet, true);
  until(state, s => s.p.x >= 1031, { right: true }, 300);
  until(state, s => s.p.climbing === 'crest', { up: true }, 400);
  until(state, s => s.p.climbing === '' && s.p.onGround, { up: true }, 100);
  until(state, s => s.p.x <= 135, { left: true }, 700);
  tick(state, { action: true }); tick(state);
  assert.equal(state.flags.shortcut, true);
  until(state, s => s.p.x >= 155, { right: true }, 100);
  until(state, s => s.p.y + s.p.h >= 392, { down: true }, 300);
  tick(state, {}, 140);
  assert.equal(state.liftY, model.landmarks.lift.lowered);
  until(state, s => s.p.x >= 177, { right: true }, 100);
  tick(state, { right: true, jump: true }, 21);
  tick(state, { right: true }, 12);
  tick(state, {}, 60);
  assert.equal(state.p.y + state.p.h, model.landmarks.lift.lowered);
  until(state, s => s.p.x <= 207, { left: true }, 100);
  tick(state, {}, 30);
  tick(state, { right: true, jump: true });
  tick(state, { right: true }, 33);
  tick(state, {}, 30);
  until(state, s => s.flags.serviceCoil === true, { right: true }, 30);
  const restored = model.create(model.snapshot(state));
  assert.equal(restored.flags.shortcut, true);
  assert.equal(restored.flags.serviceCoil, true);
  assert.equal(restored.liftY, model.landmarks.lift.lowered);
});

function trySorter(coil) {
  // Isolate the jump from the pickup: both rovers start on the same shelf.
  const state = model.create({ flags: { magnet: true, shortcut: coil, serviceCoil: coil } });
  state.p.x = 267;
  state.p.y = model.landmarks.serviceLedge.y - state.p.h;
  state.p.onGround = true;
  state.p.vx = 0;
  state.liftY = model.landmarks.lift.lowered;
  let landedOnSorter = false, reachedPumpBay = false;
  for (let i = 0; i < 500; i++) {
    tick(state, { right: i < 350, jump: i === 0 });
    const feet = state.p.y + state.p.h;
    if (state.p.onGround && Math.abs(feet - model.landmarks.sorter.y) < .01) landedOnSorter = true;
    if (state.p.x >= 929 && state.p.onGround && Math.abs(feet - 392) < .01) reachedPumpBay = true;
  }
  return { landedOnSorter, reachedPumpBay, state };
}
test('stock jump cannot enter the sorter; saved coil jump returns to pump bay', () => {
  const stock = trySorter(false);
  const upgraded = trySorter(true);
  assert.equal(stock.landedOnSorter, false);
  assert.equal(stock.reachedPumpBay, false);
  assert.equal(upgraded.landedOnSorter, true);
  assert.equal(upgraded.reachedPumpBay, true);
  assert.equal(upgraded.state.flags.serviceCoil, true);
  assert.ok(upgraded.state.camera.x >= 0);
});
test('lower road stays open beneath the lift', () => {
  const state = model.create({ flags: { magnet: true, shortcut: true } });
  assert.equal(state.liftY, model.landmarks.lift.lowered);
  until(state, s => s.p.x >= 932, { right: true });
  assert.equal(state.p.y + state.p.h, 392);
});
