import assert from "node:assert/strict";
import {SessionStateMachine} from "./session-state.ts";

const machine = new SessionStateMachine();
assert.equal(machine.transition("draft", "prepare"), "preparing");
assert.equal(machine.transition("preparing", "plan_ready"), "ready");
assert.equal(machine.transition("ready", "start"), "live");
assert.equal(machine.transition("live", "end"), "completed");
assert.equal(machine.transition("completed", "report_ready"), "report_ready");

assert.throws(()=> machine.transition("draft", "start"))
assert.throws(()=> machine.transition("report_ready", "start"))

console.log("sesion state machine ok")