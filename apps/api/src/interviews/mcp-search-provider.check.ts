import assert from "node:assert/strict";
import { McpSearchProvider } from "./search-provider.ts";

async function main() {
  const sources = await new McpSearchProvider().search({
    platform: "leetcode",
    query: "Google Software Engineer interview experience site:leetcode.com",
  });
  assert.equal(sources[0].url.startsWith("https://"), true);
  assert.equal(sources[0].url.includes("google.com/search"), false);
  assert.notEqual(sources[0].excerpt, "Public search for interview preparation.");
  assert.equal(sources[0].excerpt.length > 40, true);
  console.log(sources[0].url);
  console.log(sources[0].excerpt);
  console.log("mcp search provider ok");
}
main();