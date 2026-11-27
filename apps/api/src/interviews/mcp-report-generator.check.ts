import assert from "node:assert/strict";
import { McpReportGenerator } from "../application/interview/report-interview.ts";

async function main() {
  const report = await new McpReportGenerator().generate([
    {
      sectionName: "Background",
      prompt: "Discuss background",
      answer: "I designed a service and chose a cache to keep reads fast.",
    },
  ]);
  assert.equal(report.overallScore, 80);
  assert.deepEqual(report.strengths, ["Developed answer in Background."]);
  console.log("mcp report generator ok");
}
main();